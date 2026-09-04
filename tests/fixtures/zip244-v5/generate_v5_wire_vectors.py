#!/usr/bin/env python3
"""Generate independent unsigned v5 transparent wire vectors.

The field order follows the pinned zcash-test-vectors TransactionV5
serializer at commit 113b3914c79dfe7eb68cb754cd7fea20b75e2e61:
header_bytes, transparent_bytes, sapling_bytes, and orchard_bytes.
Transparent-only v5 transactions therefore end with exactly three zero
CompactSize counts: Sapling spends, Sapling outputs, and Orchard actions.
"""

from __future__ import annotations

import json
import struct
import sys
from pathlib import Path


UPSTREAM = (
    "https://github.com/zcash/zcash-test-vectors/blob/"
    "113b3914c79dfe7eb68cb754cd7fea20b75e2e61/"
    "zcash_test_vectors/transaction.py"
)


def compact_size(value: int) -> bytes:
    if value < 0:
        raise ValueError("CompactSize cannot encode a negative value")
    if value < 0xFD:
        return struct.pack("<B", value)
    if value <= 0xFFFF:
        return b"\xfd" + struct.pack("<H", value)
    if value <= 0xFFFFFFFF:
        return b"\xfe" + struct.pack("<I", value)
    return b"\xff" + struct.pack("<Q", value)


def script(hex_value: str) -> bytes:
    raw = bytes.fromhex(hex_value)
    return compact_size(len(raw)) + raw


def outpoint(item: dict[str, object]) -> bytes:
    txid = bytes.fromhex(str(item["txid"]))
    return txid[::-1] + struct.pack("<I", int(item["outputIndex"]))


def serialize(vector: dict[str, object]) -> bytes:
    inputs = vector["inputs"]
    outputs = vector["outputs"]
    assert isinstance(inputs, list)
    assert isinstance(outputs, list)

    header = b"".join(
        (
            struct.pack("<I", 0x80000005),
            struct.pack("<I", int(str(vector["versionGroupId"]), 16)),
            struct.pack("<I", int(str(vector["consensusBranchId"]), 16)),
            struct.pack("<I", int(vector["lockTime"])),
            struct.pack("<I", int(vector["expiryHeight"])),
        )
    )
    transparent = compact_size(len(inputs))
    for item in inputs:
        transparent += outpoint(item)
        transparent += b"\x00"  # Empty scriptSig: no signature material.
        transparent += struct.pack("<I", int(item["sequence"]))
    transparent += compact_size(len(outputs))
    for item in outputs:
        transparent += struct.pack("<Q", int(str(item["valueZatoshis"])))
        transparent += script(str(item["scriptPubKeyHex"]))

    # ZIP 225 v5 transparent-only encoding: both Sapling vectors and the
    # Orchard action vector are empty, so no shielded payload follows.
    return header + transparent + b"\x00\x00\x00"


def main() -> None:
    if len(sys.argv) != 3:
        raise SystemExit("usage: generate_v5_wire_vectors.py INPUT_JSON OUTPUT_JSON")
    source = Path(sys.argv[1])
    destination = Path(sys.argv[2])
    document = json.loads(source.read_text())
    vectors = []
    for vector in document["vectors"]:
        wire = serialize(vector)
        vectors.append(
            {
                "name": vector["name"],
                "inputCount": len(vector["inputs"]),
                "outputCount": len(vector["outputs"]),
                "wireHex": wire.hex(),
            }
        )
    destination.write_text(
        json.dumps(
            {
                "algorithm": "independent Python struct serialization",
                "source": UPSTREAM,
                "vectors": vectors,
            },
            indent=2,
        )
        + "\n"
    )


if __name__ == "__main__":
    main()
