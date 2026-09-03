#!/usr/bin/env python3
"""Call the pinned upstream ZIP 244 generator on local effecting fields."""

import json
import struct
import sys

from zcash_test_vectors import zip_0244
from zcash_test_vectors.transaction import OutPoint, Script, TxIn


class TxOut:
    def __init__(self, value, script):
        self.nValue = value
        self.scriptPubKey = Script.from_bytes(bytes.fromhex(script))

    def __bytes__(self):
        return struct.pack("<Q", self.nValue) + bytes(self.scriptPubKey)


class Tx:
    nVersionGroupId = 0x26A7270A
    nConsensusBranchId = 0x37A5165B
    vSpendsSapling = []
    vOutputsSapling = []
    vActionsOrchard = []

    def __init__(self, vector):
        self.nLockTime = vector["lockTime"]
        self.nExpiryHeight = vector["expiryHeight"]
        self.vin = [
            TxIn.from_components(
                OutPoint.from_components(bytes.fromhex(item["txid"])[::-1], item["outputIndex"]),
                Script.from_bytes(b""),
                item["sequence"],
            )
            for item in vector["inputs"]
        ]
        self.vout = [TxOut(int(item["valueZatoshis"]), item["scriptPubKeyHex"]) for item in vector["outputs"]]

    def version_bytes(self):
        return 0x80000005

    def is_coinbase(self):
        return False


class TransparentInput:
    def __init__(self, index, item):
        self.nIn = index
        self.amount = int(item["valueZatoshis"])
        self.scriptPubKey = Script.from_bytes(bytes.fromhex(item["scriptPubKeyHex"]))


def main():
    with open(sys.argv[1]) as handle:
        document = json.load(handle)
    for vector in document["vectors"]:
        tx = Tx(vector)
        inputs = [TransparentInput(index, item) for index, item in enumerate(vector["inputs"])]
        selected = inputs[vector["inputIndex"]]
        digest = zip_0244.signature_digest(tx, inputs, zip_0244.SIGHASH_ALL, selected).hex()
        expected = vector["expectedSighash"][2:]
        status = "MATCH" if digest == expected else "MISMATCH"
        print(vector["name"], digest, status)
        if digest != expected:
            raise SystemExit(1)


if __name__ == "__main__":
    main()
