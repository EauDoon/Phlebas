#!/usr/bin/env python3
"""Reproduce and check public synthetic Zcash compact-message vectors.

The scalar values below select ECDSA signatures directly.  They are not private
keys: each public key is derived from the selected recovery point, r, s, and
the message digest.  No funded address or chain observation is involved.

Source format: zcashd compact signed messages at commit
558f686599586f55def3db86955d74d3be44605e.
"""

from __future__ import annotations

import base64
import hashlib
import json
import sys
from pathlib import Path


P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
GX = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
GY = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
G = (GX, GY)
ZCASH_MAGIC = "Zcash Signed Message:\n"


def inv(value: int, modulus: int) -> int:
    return pow(value % modulus, -1, modulus)


def add(left: tuple[int, int] | None, right: tuple[int, int] | None) -> tuple[int, int] | None:
    if left is None:
        return right
    if right is None:
        return left
    x1, y1 = left
    x2, y2 = right
    if x1 == x2:
        if (y1 + y2) % P == 0:
            return None
        slope = (3 * x1 * x1 * inv(2 * y1, P)) % P
    else:
        slope = ((y2 - y1) * inv(x2 - x1, P)) % P
    x3 = (slope * slope - x1 - x2) % P
    return x3, (slope * (x1 - x3) - y1) % P


def mul(point: tuple[int, int] | None, scalar: int) -> tuple[int, int] | None:
    result = None
    addend = point
    scalar %= N
    while scalar:
        if scalar & 1:
            result = add(result, addend)
        addend = add(addend, addend)
        scalar >>= 1
    return result


def square_root(value: int) -> int:
    root = pow(value % P, (P + 1) // 4, P)
    if (root * root) % P != value % P:
        raise ValueError("point x is not on secp256k1")
    return root


def compact_size(value: int) -> bytes:
    if value < 0 or value > 0xFFFF:
        raise ValueError("fixture string is outside the compact-size range")
    if value < 0xFD:
        return bytes([value])
    return b"\xFD" + value.to_bytes(2, "little")


def message_digest(message: str, magic: str = ZCASH_MAGIC) -> bytes:
    magic_bytes = magic.encode("ascii")
    message_bytes = message.encode("ascii")
    payload = (
        compact_size(len(magic_bytes))
        + magic_bytes
        + compact_size(len(message_bytes))
        + message_bytes
    )
    return hashlib.sha256(hashlib.sha256(payload).digest()).digest()


def point_for_recovery(recovery_id: int, r_hint: int) -> tuple[int, int, int]:
    for r in range(r_hint, r_hint + 100000):
        x = r + (recovery_id >> 1) * N
        if 0 < r < N and x < P:
            try:
                y = square_root((x * x * x + 7) % P)
            except ValueError:
                continue
            if y & 1 != recovery_id & 1:
                y = P - y
            return r, x, y
    raise ValueError("could not find a deterministic recovery point")


def hash160(value: bytes) -> bytes:
    digest = hashlib.sha256(value).digest()
    return hashlib.new("ripemd160", digest).digest()


BASE58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"


def base58_check(version: bytes, payload: bytes) -> str:
    body = version + payload
    check = hashlib.sha256(hashlib.sha256(body).digest()).digest()[:4]
    value = int.from_bytes(body + check, "big")
    encoded = ""
    while value:
        value, remainder = divmod(value, 58)
        encoded = BASE58[remainder] + encoded
    leading = len(body + check) - len((body + check).lstrip(b"\0"))
    return "1" * leading + encoded


def point_bytes(point: tuple[int, int], compressed: bool) -> bytes:
    x, y = point
    if compressed:
        return bytes([2 + (y & 1)]) + x.to_bytes(32, "big")
    return b"\x04" + x.to_bytes(32, "big") + y.to_bytes(32, "big")


def make_vector(
    name: str,
    message: str,
    recovery_id: int,
    compressed: bool,
    r_hint: int,
    s: int,
    magic: str = ZCASH_MAGIC,
) -> dict[str, object]:
    digest = message_digest(message, magic)
    z = int.from_bytes(digest, "big")
    r, x, y = point_for_recovery(recovery_id, r_hint)
    recovery_point = (x, y)
    if not 0 < s < N:
        raise ValueError("invalid fixture s")
    numerator = add(mul(G, (-z) % N), mul(recovery_point, s))
    public_point = mul(numerator, inv(r, N))
    if public_point is None:
        raise ValueError("fixture recovered point is infinity")
    public_key = point_bytes(public_point, compressed)
    header = 27 + recovery_id + (4 if compressed else 0)
    compact = bytes([header]) + r.to_bytes(32, "big") + s.to_bytes(32, "big")
    account = "zcash:mainnet:" + base58_check(b"\x1c\xb8", hash160(public_key))
    return {
        "name": name,
        "message": message,
        "recoveryId": recovery_id,
        "compressed": compressed,
        "highS": s > N // 2,
        "digestHex": "0x" + digest.hex(),
        "compactSignatureHex": "0x" + compact.hex(),
        "signatureBase64": base64.b64encode(compact).decode("ascii"),
        "publicKeyHex": "0x" + public_key.hex(),
        "account": account,
        "synthetic": True,
        "signedMagic": magic,
    }


def build_fixture() -> dict[str, object]:
    vectors = [
        make_vector(
            "len16-compressed-recovery0",
            "0123456789ABCDEF",
            0,
            True,
            2,
            0x123456789ABCDEF123456789ABCDEF123456789ABCDEF123456789ABCDEF1,
        ),
        make_vector(
            "len252-uncompressed-recovery1",
            ("Ab3!-" * 51)[:252],
            1,
            False,
            3,
            0x223456789ABCDEF123456789ABCDEF123456789ABCDEF123456789ABCDEF2,
        ),
        make_vector(
            "len253-compressed-recovery2",
            ("Z9_?q" * 51)[:253],
            2,
            True,
            4,
            0x323456789ABCDEF123456789ABCDEF123456789ABCDEF123456789ABCDEF3,
        ),
        make_vector(
            "len512-highS-uncompressed-recovery3",
            ("xyZ7! " * 86)[:512],
            3,
            False,
            5,
            N - 0x12345,
        ),
        make_vector(
            "provider-session-challenge",
            "phlebas-connect-challenge-0001",
            1,
            True,
            7,
            0x523456789ABCDEF123456789ABCDEF123456789ABCDEF123456789ABCDEF5,
        ),
    ]
    wrong_magic = make_vector(
        "wrong-magic",
        "wrong-magic-test!",
        0,
        True,
        6,
        0x423456789ABCDEF123456789ABCDEF123456789ABCDEF123456789ABCDEF4,
        "Bitcoin Signed Message:\n",
    )
    payload = hash160(bytes.fromhex(vectors[0]["publicKeyHex"][2:]))
    return {
        "provenance": {
            "source": "zcashd compact signed-message format",
            "sourceCommit": "558f686599586f55def3db86955d74d3be44605e",
            "synthetic": True,
            "note": "Generated from public recovery points and ECDSA scalars; no private keys, funded addresses, or chain observations.",
        },
        "vectors": vectors,
        "negative": {
            "wrongMagic": wrong_magic,
            "wrongNetworkAccount": "zcash:testnet:" + base58_check(b"\x1d\x25", payload),
            "wrongKindAccount": "zcash:mainnet:" + base58_check(b"\x1c\xbd", payload),
        },
    }


def main() -> int:
    fixture_path = Path(__file__).with_name("synthetic-vectors.json")
    if len(sys.argv) == 2 and sys.argv[1] == "--write":
        fixture_path.write_text(
            json.dumps(build_fixture(), indent=2) + "\n",
            encoding="utf-8",
        )
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))
    assert fixture == build_fixture(), "synthetic vectors differ from the reference generator"
    print("verified", len(fixture["vectors"]), "synthetic vectors")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
