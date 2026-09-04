import assert from "node:assert/strict";
import test from "node:test";

import { recoverCompactPublicKey } from "./secp256k1.ts";
import vectorsDocument from "../../tests/fixtures/zcash-message/synthetic-vectors.json" with { type: "json" };

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;

type Vector = (typeof vectorsDocument.vectors)[number];

function bytesToHex(value: Uint8Array): string {
  return "0x" + Buffer.from(value).toString("hex");
}

function fixedHex(value: bigint): string {
  return value.toString(16).padStart(64, "0");
}

function compactSignature(header: number, r: bigint, s: bigint): string {
  return "0x" + header.toString(16).padStart(2, "0") + fixedHex(r) + fixedHex(s);
}

function parts(vector: Vector): { r: bigint; s: bigint } {
  const body = vector.compactSignatureHex.slice(4);
  return {
    r: BigInt("0x" + body.slice(0, 64)),
    s: BigInt("0x" + body.slice(64, 128)),
  };
}

test("recovers every synthetic public key, including compressed and high-s forms", () => {
  for (const vector of vectorsDocument.vectors) {
    const recovered = recoverCompactPublicKey(vector.digestHex, vector.compactSignatureHex);
    assert.equal(bytesToHex(recovered), vector.publicKeyHex, vector.name);
    assert.equal(recovered.length, vector.compressed ? 33 : 65, vector.name);
    assert.equal(
      recovered[0],
      vector.compressed ? Number(BigInt("0x" + vector.publicKeyHex.slice(2, 4))) : 4,
      vector.name,
    );
  }
});

test("accepts both serialization flags for each recovery id", () => {
  for (const vector of vectorsDocument.vectors) {
    const { r, s } = parts(vector);
    const recoveryId = vector.recoveryId;
    for (const compressed of [false, true]) {
      const header = 27 + recoveryId + (compressed ? 4 : 0);
      const recovered = recoverCompactPublicKey(
        vector.digestHex,
        compactSignature(header, r, s),
      );
      assert.equal(recovered.length, compressed ? 33 : 65, vector.name + " header " + header);
      assert.equal(
        bytesToHex(recovered.slice(1, 33)),
        "0x" + vector.publicKeyHex.slice(4, 68),
        vector.name + " x",
      );
    }
  }
});

test("returns a fresh public-key byte array for every recovery", () => {
  const vector = vectorsDocument.vectors[0];
  const first = recoverCompactPublicKey(vector.digestHex, vector.compactSignatureHex);
  first[0] ^= 0xff;
  const second = recoverCompactPublicKey(vector.digestHex, vector.compactSignatureHex);
  assert.equal(bytesToHex(second), vector.publicKeyHex);
});

test("rejects malformed digest and compact-signature encodings", () => {
  const vector = vectorsDocument.vectors[0];
  const valid = vector.compactSignatureHex;
  for (const digest of [
    "",
    "0x",
    "0x" + "00".repeat(31),
    "0x" + "00".repeat(33),
    "0x" + "gg".repeat(32),
    "0x" + "00".repeat(31) + "0",
  ]) {
    assert.throws(() => recoverCompactPublicKey(digest, valid), digest);
  }
  for (const signature of [
    "",
    "0x",
    "0x" + "00".repeat(64),
    "0x" + "00".repeat(66),
    "0x" + "gg".repeat(65),
    "0x" + "00".repeat(64) + "0",
  ]) {
    assert.throws(() => recoverCompactPublicKey(vector.digestHex, signature), signature);
  }
  assert.equal(
    bytesToHex(recoverCompactPublicKey(
      vector.digestHex.slice(2).toUpperCase(),
      vector.compactSignatureHex.slice(2).toUpperCase(),
    )),
    vector.publicKeyHex,
  );
});

test("rejects headers outside the zcashd compact range", () => {
  const { r, s } = parts(vectorsDocument.vectors[0]);
  for (const header of [26, 35, 0, 255]) {
    assert.throws(
      () => recoverCompactPublicKey(
        vectorsDocument.vectors[0].digestHex,
        compactSignature(header, r, s),
      ),
      /header/,
    );
  }
});

test("rejects zero, out-of-range, and non-curve r/s values", () => {
  const vector = vectorsDocument.vectors[0];
  const digest = vector.digestHex;
  const validS = parts(vector).s;
  const invalidValues = [
    ["zero r", compactSignature(27, 0n, validS)],
    ["r equal to group order", compactSignature(27, N, validS)],
    ["r above group order", compactSignature(27, N + 1n, validS)],
    ["zero s", compactSignature(27, parts(vector).r, 0n)],
    ["s equal to group order", compactSignature(27, parts(vector).r, N)],
    ["s above group order", compactSignature(27, parts(vector).r, N + 1n)],
    ["recovery x at field modulus", compactSignature(29, P - N, validS)],
    ["recovery x without a curve point", compactSignature(27, 5n, 1n)],
  ] as const;
  for (const [label, signature] of invalidValues) {
    assert.throws(() => recoverCompactPublicKey(digest, signature), label);
  }
});

test("rejects public-key recovery to the point at infinity", () => {
  const generatorX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
  assert.throws(() => recoverCompactPublicKey(fixedHex(1n), compactSignature(27, generatorX, 1n)), /infinity/);
});
