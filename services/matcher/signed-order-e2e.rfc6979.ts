/**
 * Test-only RFC 6979 deterministic ECDSA (secp256k1) signer for the signed
 * order end-to-end evidence test.
 *
 * This module exists so the matcher can be exercised against signatures
 * produced by an implementation independent of the repository's recovery
 * code — the same differential technique the repository uses for its pinned
 * Zcash reference vectors. It is imported only by tests: no production
 * module may import it, because signing belongs to wallets, never to
 * Phlebas code.
 *
 * Algorithm: RFC 6979 with HMAC-SHA256 (RFC 6979 §3.2), secp256k1, low-s
 * normalized signatures with Ethereum-style v ∈ {27, 28}.
 */

import { createHmac } from "node:crypto";

const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;

type Point = { x: bigint; y: bigint } | null;

function mod(value: bigint, modulus: bigint): bigint {
  const remainder = value % modulus;
  return remainder < 0n ? remainder + modulus : remainder;
}

function inverse(value: bigint, modulus: bigint): bigint {
  let [a, b] = [mod(value, modulus), modulus];
  // Invariant: x0*value ≡ a and x1*value ≡ b (mod modulus).
  let [x0, x1] = [1n, 0n];
  while (b > 0n) {
    const quotient = a / b;
    [a, b] = [b, a - quotient * b];
    [x0, x1] = [x1, x0 - quotient * x1];
  }
  if (a !== 1n) throw new RangeError("value is not invertible");
  return mod(x0, modulus);
}

function pointAdd(a: Point, b: Point): Point {
  if (a === null) return b;
  if (b === null) return a;
  const sameX = mod(a.x, P) === mod(b.x, P);
  const sameY = mod(a.y, P) === mod(b.y, P);
  if (sameX && !sameY) return null; // vertical line: the sum is infinity
  let slope: bigint;
  if (sameX && sameY) {
    // Tangent (point doubling).
    slope = mod(3n * a.x * a.x, P) * inverse(2n * a.y, P) % P;
  } else {
    slope = mod(b.y - a.y, P) * inverse(mod(b.x - a.x, P), P) % P;
  }
  const x = mod(slope * slope - a.x - b.x, P);
  return { x, y: mod(slope * (a.x - x) - a.y, P) };
}

function scalarMultiply(scalar: bigint, point: { x: bigint; y: bigint }): Point {
  let result: Point = null;
  let addend: Point = { x: mod(point.x, P), y: mod(point.y, P) };
  let k = mod(scalar, N);
  while (k > 0n) {
    if (k & 1n) result = pointAdd(result, addend);
    addend = pointAdd(addend, addend);
    k >>= 1n;
  }
  return result;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function intTo32Bytes(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 31; i >= 0; i--) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function hmac(key: Uint8Array<ArrayBufferLike>, ...parts: Uint8Array<ArrayBufferLike>[]): Uint8Array<ArrayBufferLike> {
  const hmacInstance = createHmac("sha256", Buffer.from(key));
  for (const part of parts) hmacInstance.update(Buffer.from(part));
  // Copy into a fresh ArrayBuffer-backed view so the result is a plain Uint8Array.
  return new Uint8Array(new Uint8Array(hmacInstance.digest()));
}

export type SignedDigest = { r: bigint; s: bigint; recoveryId: 0 | 1 | 2 | 3 };

/** RFC 6979 deterministic nonce, then a low-s ECDSA signature. */
export function signDigestRfc6979(privateKey: bigint, digest: Uint8Array): SignedDigest {
  if (digest.length !== 32) throw new RangeError("digest must be 32 bytes");
  const z = mod(BigInt("0x" + hex(digest)), N);
  const xBytes = intTo32Bytes(privateKey);
  const zModded = intTo32Bytes(z); // bits2octets: h1 mod n, same length
  let v: Uint8Array<ArrayBufferLike> = new Uint8Array(32).fill(1);
  let k: Uint8Array<ArrayBufferLike> = new Uint8Array(32);
  k = hmac(k, v, new Uint8Array([0x00]), xBytes, zModded);
  v = hmac(k, v);
  let candidate: SignedDigest | null = null;
  for (let attempts = 0; attempts < 128 && candidate === null; attempts++) {
    v = hmac(k, v);
    const nonce = BigInt("0x" + hex(v)) % N;
    if (nonce >= 1n) {
      const point = scalarMultiply(nonce, { x: GX, y: GY });
      if (point !== null) {
        const r = mod(point.x, N);
        if (r !== 0n) {
          let s = mod(inverse(nonce, N) * (z + r * privateKey), N);
          if (s !== 0n) {
            // Recovery id: y parity (bit 0) plus whether x overflowed the
            // group order (bit 1), per the compact recovery convention.
            let recoveryId = (point.y & 1n) === 1n ? 1 : 0;
            if (point.x >= N) recoveryId += 2;
            if (s > N / 2n) {
              s = N - s;
              recoveryId = recoveryId === 1 ? 0 : recoveryId === 0 ? 1 : recoveryId === 3 ? 2 : 3;
            }
            candidate = { r, s, recoveryId: recoveryId as 0 | 1 | 2 | 3 };
          }
        }
      }
    }
    k = hmac(k, v, new Uint8Array([0x01]));
    v = hmac(k, v);
  }
  if (candidate === null) throw new Error("RFC 6979 failed to produce a signature");
  return candidate;
}

export function compactSignature(signature: SignedDigest): `0x${string}` {
  const pad = (value: bigint): string => value.toString(16).padStart(64, "0");
  const v = 27 + signature.recoveryId;
  return `0x${pad(signature.r)}${pad(signature.s)}${v.toString(16)}`;
}

/** Uncompressed public key (64 bytes, X||Y) for a private scalar. */
export function publicKeyBytes(privateKey: bigint): Uint8Array {
  const point = scalarMultiply(privateKey, { x: GX, y: GY });
  if (point === null) throw new Error("public key at infinity");
  return new Uint8Array([...intTo32Bytes(point.x), ...intTo32Bytes(point.y)]);
}
