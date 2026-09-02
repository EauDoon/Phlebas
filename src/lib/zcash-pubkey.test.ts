import { strict as assert } from "node:assert";
import { test } from "node:test";

import { encodeCompressedPubkey, parseCompressedPubkey } from "./zcash-pubkey.ts";

const SAMPLE: Uint8Array = (() => {
  const out = new Uint8Array(33);
  out[0] = 0x02;
  for (let i = 1; i < 33; i++) out[i] = (i * 17 + 3) & 0xff;
  return out;
})();

test("parseCompressedPubkey accepts a 33-byte prefix-2 key", () => {
  const parsed = parseCompressedPubkey(SAMPLE);
  assert.equal(parsed.parity, 0x02);
  assert.equal(parsed.x.length, 32);
});

test("parseCompressedPubkey accepts a 33-byte prefix-3 key", () => {
  const parsed = parseCompressedPubkey(new Uint8Array([0x03, ...SAMPLE.subarray(1)]));
  assert.equal(parsed.parity, 0x03);
});

test("parseCompressedPubkey rejects a wrong length", () => {
  assert.throws(() => parseCompressedPubkey(new Uint8Array(32)), /33 bytes/);
  assert.throws(() => parseCompressedPubkey(new Uint8Array(34)), /33 bytes/);
});

test("parseCompressedPubkey rejects a wrong prefix", () => {
  const bad = new Uint8Array(SAMPLE);
  bad[0] = 0x04;
  assert.throws(() => parseCompressedPubkey(bad), /0x02 or 0x03/);
});

test("encodeCompressedPubkey round-trips a parsed pubkey", () => {
  const encoded = encodeCompressedPubkey(parseCompressedPubkey(SAMPLE));
  assert.equal(encoded.length, 33);
  for (let i = 0; i < 33; i++) assert.equal(encoded[i], SAMPLE[i]);
});

test("accepts a valid key whose x coordinate begins with a zero byte", () => {
  // x is a field element, so a leading 0x00 is an ordinary small
  // coordinate that occurs in about one key in 256. The check this
  // replaced rejected exactly those, and was dead code everywhere else
  // because it only ever raised when i - 1 was 0.
  const raw = new Uint8Array(33);
  raw[0] = 0x02;
  raw[1] = 0x00;
  for (let i = 2; i < 33; i++) raw[i] = (i * 13 + 7) & 0xff;
  const parsed = parseCompressedPubkey(raw);
  assert.equal(parsed.parity, 0x02);
  assert.equal(parsed.x[0], 0x00);
  assert.deepEqual([...encodeCompressedPubkey(parsed)], [...raw]);
});

test("rejects an x coordinate at or above the secp256k1 field order", () => {
  const order = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  const encode = (x: bigint): Uint8Array => {
    const out = new Uint8Array(33);
    out[0] = 0x03;
    for (let i = 0; i < 32; i++) out[32 - i] = Number((x >> BigInt(8 * i)) & 0xffn);
    return out;
  };
  assert.throws(() => parseCompressedPubkey(encode(order)), /field order/);
  assert.throws(() => parseCompressedPubkey(encode(order + 1n)), /field order/);
  assert.throws(() => parseCompressedPubkey(encode((1n << 256n) - 1n)), /field order/);
  assert.equal(parseCompressedPubkey(encode(order - 1n)).parity, 0x03);
});

test("rejects a zero x coordinate", () => {
  const raw = new Uint8Array(33);
  raw[0] = 0x02;
  assert.throws(() => parseCompressedPubkey(raw), /must not be zero/);
});

test("the parsed x coordinate does not alias the caller's buffer", () => {
  const raw = new Uint8Array(33);
  raw[0] = 0x02;
  for (let i = 1; i < 33; i++) raw[i] = 0xaa;
  const parsed = parseCompressedPubkey(raw);
  raw[1] = 0xff;
  assert.equal(parsed.x[0], 0xaa);
});
