import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  base58checkDecode,
  base58checkEncode,
  base58Decode,
  base58Encode,
} from "./base58check.ts";

test("base58 encodes the empty payload as empty string", () => {
  assert.equal(base58Encode(new Uint8Array(0)), "");
});

test("base58 decodes the empty string as empty payload", () => {
  assert.equal(base58Decode("").length, 0);
});

test("base58 encodes leading zero bytes as 1 characters", () => {
  assert.equal(base58Encode(new Uint8Array([0, 0, 0])), "111");
  assert.equal(base58Encode(new Uint8Array([0, 1])), "12");
  assert.equal(base58Encode(new Uint8Array([0, 0x10])), "1H");
});

test("base58 round-trips random bytes", () => {
  for (const length of [1, 5, 10, 32, 64]) {
    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) bytes[i] = (i * 31 + 7) & 0xff;
    const encoded = base58Encode(bytes);
    const decoded = base58Decode(encoded);
    assert.equal(decoded.length, bytes.length);
    for (let i = 0; i < bytes.length; i++) assert.equal(decoded[i], bytes[i]);
  }
});

test("base58 decode rejects invalid characters", () => {
  assert.throws(() => base58Decode("0"), /Invalid base58 character/);
  assert.throws(() => base58Decode("O"), /Invalid base58 character/);
  assert.throws(() => base58Decode("I"), /Invalid base58 character/);
  assert.throws(() => base58Decode("l"), /Invalid base58 character/);
});

test("base58check rejects an input whose checksum does not match", () => {
  const payload = new Uint8Array([0x1d, 0x25, ...new Array(20).fill(0xab)]);
  const good = base58checkEncode(payload);
  // Flip a payload byte without updating the checksum
  const bad = good.slice(0, -4) + (good.endsWith("a") ? "b" : "a");
  assert.throws(() => base58checkDecode(bad), /checksum mismatch/);
});

test("base58check round-trips a 21-byte payload", () => {
  const payload = new Uint8Array(21);
  for (let i = 0; i < payload.length; i++) payload[i] = (i * 13 + 5) & 0xff;
  const encoded = base58checkEncode(payload);
  const decoded = base58checkDecode(encoded);
  assert.equal(decoded.length, 21);
  for (let i = 0; i < payload.length; i++) assert.equal(decoded[i], payload[i]);
});

test("base58check rejects payloads shorter than five bytes", () => {
  assert.throws(() => base58checkDecode("11"), /too short/);
});
