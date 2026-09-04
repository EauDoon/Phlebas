#!/usr/bin/env python3
"""Independently verify public synthetic ECDSA vectors with system OpenSSL.

Requires Python 3 and OpenSSL with secp256k1 support. No private keys, wallet,
network, or signing operation is used. This checks the public key/signature
relation, not zcashd interoperability or wallet qualification.
"""
import json
from pathlib import Path
import subprocess
import tempfile


def der_integer(value):
    value = value.lstrip(b"\0") or b"\0"
    if value[0] & 128:
        value = b"\0" + value
    return b"\x02" + bytes([len(value)]) + value


vectors = json.loads(Path(__file__).with_name("synthetic-vectors.json").read_text())["vectors"]
with tempfile.TemporaryDirectory(prefix="phlebas-public-verify-") as directory:
    root = Path(directory)
    for vector in vectors:
        public_key = bytes.fromhex(vector["publicKeyHex"][2:])
        signature = bytes.fromhex(vector["compactSignatureHex"][4:])
        integers = der_integer(signature[:32]) + der_integer(signature[32:])
        # SubjectPublicKeyInfo: id-ecPublicKey, secp256k1, SEC1 point bit string.
        prefix = "3036301006072a8648ce3d020106052b8104000a032200" if len(public_key) == 33 else "3056301006072a8648ce3d020106052b8104000a034200"
        (root / "public.der").write_bytes(bytes.fromhex(prefix) + public_key)
        (root / "signature.der").write_bytes(b"\x30" + bytes([len(integers)]) + integers)
        (root / "digest.bin").write_bytes(bytes.fromhex(vector["digestHex"][2:]))
        subprocess.run([
            "openssl", "pkeyutl", "-verify", "-pubin", "-keyform", "DER",
            "-inkey", str(root / "public.der"), "-sigfile", str(root / "signature.der"),
            "-in", str(root / "digest.bin"), "-pkeyopt", "digest:sha256",
        ], check=True, capture_output=True)
        print("MATCH", vector["name"])
