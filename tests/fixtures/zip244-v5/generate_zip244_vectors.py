#!/usr/bin/env python3
"""Generate the local ZIP 244 v5 oracle vectors without importing app code.

The implementation follows ZIP 244's signature_digest tree and uses only
Python's standard-library hashlib.blake2b with its 16-byte personalization
field.  The committed manifest validator is deliberately exercised by the
TypeScript tests; this script only hashes the effecting transaction fields.
"""

from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parent
VECTORS = ROOT / "zip244-v5-vectors.json"


def digest(person: bytes, *parts: bytes) -> bytes:
    hasher = hashlib.blake2b(digest_size=32, person=person)
    for part in parts:
        hasher.update(part)
    return hasher.digest()


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


def amount(value: str) -> bytes:
    return struct.pack("<Q", int(value))


def script(value: str) -> bytes:
    raw = bytes.fromhex(value)
    return compact_size(len(raw)) + raw


def outpoint(item: dict[str, object]) -> bytes:
    # Zcash displays txids in big-endian human order but serializes outpoints
    # with the 32-byte hash reversed, followed by little-endian vout.
    return bytes.fromhex(str(item["txid"]))[::-1] + struct.pack("<I", int(item["outputIndex"]))


def compute(vector: dict[str, object]) -> str:
    inputs = vector["inputs"]
    outputs = vector["outputs"]
    assert isinstance(inputs, list)
    assert isinstance(outputs, list)

    version = struct.pack("<I", 0x80000005)
    version_group = struct.pack("<I", int(str(vector["versionGroupId"]), 16))
    branch = struct.pack("<I", int(str(vector["consensusBranchId"]), 16))
    header = digest(
        b"ZTxIdHeadersHash",
        version,
        version_group,
        branch,
        struct.pack("<I", int(vector["lockTime"])),
        struct.pack("<I", int(vector["expiryHeight"])),
    )

    prevouts = b"".join(outpoint(item) for item in inputs)
    amounts = b"".join(amount(str(item["valueZatoshis"])) for item in inputs)
    scripts = b"".join(script(str(item["scriptPubKeyHex"])) for item in inputs)
    sequences = b"".join(struct.pack("<I", int(item["sequence"])) for item in inputs)
    outputs_bytes = b"".join(
        amount(str(item["valueZatoshis"])) + script(str(item["scriptPubKeyHex"]))
        for item in outputs
    )

    selected_index = int(vector["inputIndex"])
    selected = inputs[selected_index]
    selected_input = (
        outpoint(selected)
        + amount(str(selected["valueZatoshis"]))
        + script(str(selected["scriptPubKeyHex"]))
        + struct.pack("<I", int(selected["sequence"]))
    )
    transparent = digest(
        b"ZTxIdTranspaHash",
        b"\x01",  # SIGHASH_ALL is an 8-bit value in ZIP 244.
        digest(b"ZTxIdPrevoutHash", prevouts),
        digest(b"ZTxTrAmountsHash", amounts),
        digest(b"ZTxTrScriptsHash", scripts),
        digest(b"ZTxIdSequencHash", sequences),
        digest(b"ZTxIdOutputsHash", outputs_bytes),
        digest(b"Zcash___TxInHash", selected_input),
    )
    sapling = digest(b"ZTxIdSaplingHash")
    orchard = digest(b"ZTxIdOrchardHash")
    return "0x" + digest(b"ZcashTxHash_" + branch, header, transparent, sapling, orchard).hex()


def main() -> None:
    document = json.loads(VECTORS.read_text())
    for vector in document["vectors"]:
        vector["expectedSighash"] = compute(vector)
    VECTORS.write_text(json.dumps(document, indent=2) + "\n")


if __name__ == "__main__":
    main()
