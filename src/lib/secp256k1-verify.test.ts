import assert from "node:assert/strict";
import test from "node:test";

import {
  recoverCompactPublicKey,
  verifySecp256k1Digest,
} from "./secp256k1.ts";
import vectorsDocument from "../../tests/fixtures/zcash-message/synthetic-vectors.json" with { type: "json" };

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

type Vector = (typeof vectorsDocument.vectors)[number];

function fixedHex(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function bytesToHex(value: Uint8Array): string {
  return "0x" + Buffer.from(value).toString("hex");
}

function signatureBody(vector: Vector): string {
  return vector.compactSignatureHex.slice(4);
}

const vector = vectorsDocument.vectors.find((candidate) => candidate.compressed && !candidate.highS)!;
const body = signatureBody(vector);
const r = BigInt("0x" + body.slice(0, 64));
const s = BigInt("0x" + body.slice(64));

test("verifies a public-only compact-signature vector after key recovery", () => {
  const recovered = recoverCompactPublicKey(vector.digestHex, vector.compactSignatureHex);
  assert.equal(bytesToHex(recovered), vector.publicKeyHex);
  assert.equal(verifySecp256k1Digest(vector.digestHex, body, vector.publicKeyHex), true);
});

test("rejects a wrong digest, signature, or compressed public key", () => {
  const wrongDigest = vector.digestHex.slice(0, -2) + (vector.digestHex.endsWith("00") ? "01" : "00");
  const wrongSignature = fixedHex(r + 1n) + body.slice(64);
  const otherKey = vectorsDocument.vectors.find((candidate) => candidate.compressed && candidate !== vector)!
    .publicKeyHex;

  assert.equal(verifySecp256k1Digest(wrongDigest, body, vector.publicKeyHex), false);
  assert.equal(verifySecp256k1Digest(vector.digestHex, wrongSignature, vector.publicKeyHex), false);
  assert.equal(verifySecp256k1Digest(vector.digestHex, body, otherKey), false);
});

test("accepts the mathematically equivalent high-s signature", () => {
  assert.equal(verifySecp256k1Digest(vector.digestHex, fixedHex(r) + fixedHex(N - s), vector.publicKeyHex), true);
});

test("returns false for malformed digests, signatures, points, and ranges", () => {
  const malformed = [
    ["", body, vector.publicKeyHex],
    ["0x" + "gg".repeat(32), body, vector.publicKeyHex],
    [vector.digestHex, body.slice(0, -2), vector.publicKeyHex],
    [vector.digestHex, "gg".repeat(64), vector.publicKeyHex],
    [vector.digestHex, fixedHex(0n) + fixedHex(s), vector.publicKeyHex],
    [vector.digestHex, fixedHex(N) + fixedHex(s), vector.publicKeyHex],
    [vector.digestHex, fixedHex(r) + fixedHex(0n), vector.publicKeyHex],
    [vector.digestHex, fixedHex(r) + fixedHex(N), vector.publicKeyHex],
    [vector.digestHex, body, "0x02"],
    [vector.digestHex, body, "0x04" + vector.publicKeyHex.slice(4)],
    [vector.digestHex, body, "0x02" + fixedHex(P)],
    [vector.digestHex, body, "0x02" + fixedHex(5n)],
  ] as const;

  for (const [digest, signature, publicKey] of malformed) {
    assert.equal(verifySecp256k1Digest(digest, signature, publicKey), false);
  }

  assert.equal(
    verifySecp256k1Digest(undefined as unknown as string, body, vector.publicKeyHex),
    false,
  );
  assert.equal(
    verifySecp256k1Digest(vector.digestHex, null as unknown as string, vector.publicKeyHex),
    false,
  );
  assert.equal(
    verifySecp256k1Digest(vector.digestHex, body, 42 as unknown as string),
    false,
  );
});
