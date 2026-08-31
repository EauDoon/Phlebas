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
