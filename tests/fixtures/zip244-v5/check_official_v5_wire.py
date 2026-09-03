#!/usr/bin/env python3
"""Cross-check local v5 bytes with the pinned official TransactionV5 class."""

from __future__ import annotations

import json
import sys

from zcash_test_vectors.transaction import OutPoint, Script, TransactionV5, TxIn, TxOut


def official_bytes(vector: dict[str, object]) -> bytes:
    transaction = object.__new__(TransactionV5)
    transaction.nVersionGroupId = int(str(vector["versionGroupId"]), 16)
    transaction.nConsensusBranchId = int(str(vector["consensusBranchId"]), 16)
    transaction.nLockTime = int(vector["lockTime"])
    transaction.nExpiryHeight = int(vector["expiryHeight"])
    transaction.vin = [
        TxIn.from_components(
            OutPoint.from_components(bytes.fromhex(str(item["txid"]))[::-1], int(item["outputIndex"])),
            Script.from_bytes(b""),
            int(item["sequence"]),
        )
        for item in vector["inputs"]  # type: ignore[index]
    ]
    transaction.vout = []
    for item in vector["outputs"]:  # type: ignore[index]
        output = object.__new__(TxOut)
        output.nValue = int(str(item["valueZatoshis"]))
        output.scriptPubKey = Script.from_bytes(bytes.fromhex(str(item["scriptPubKeyHex"])))
        transaction.vout.append(output)
    transaction.vSpendsSapling = []
    transaction.vOutputsSapling = []
    transaction.vActionsOrchard = []
    return bytes(transaction)


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: check_official_v5_wire.py INPUT_JSON EXPECTED_JSON")
    source = json.load(open(sys.argv[1]))
    expected = {item["name"]: item["wireHex"] for item in json.load(open(sys.argv[2]))["vectors"]}
    for vector in source["vectors"]:
        actual = official_bytes(vector).hex()
        status = "MATCH" if actual == expected[vector["name"]] else "MISMATCH"
        print(vector["name"], len(bytes.fromhex(actual)), status)
        if status != "MATCH":
            raise SystemExit(1)


if __name__ == "__main__":
    main()
