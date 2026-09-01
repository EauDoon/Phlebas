import { strict as assert } from "node:assert";
import { test } from "node:test";

import { bytesToHex, hexToBytes, isHex } from "./bytes-hex.ts";

test("bytesToHex encodes zero bytes as 0x", () => {
  assert.equal(bytesToHex(new Uint8Array(0)), "0x");
});

test("bytesToHex encodes the canonical 0xdeadbeef", () => {
  assert.equal(bytesToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef])), "0xdeadbeef");
});

test("bytesToHex zero-pads single-digit bytes", () => {
  assert.equal(bytesToHex(new Uint8Array([0x0a, 0xff])), "0x0aff");
});

test("hexToBytes rejects an odd-length string", () => {
  assert.throws(() => hexToBytes("0xabc"), /even length/);
});

test("hexToBytes accepts a 0x-prefixed string", () => {
  assert.equal(hexToBytes("0xdeadbeef").length, 4);
});

test("hexToBytes accepts a bare hex string", () => {
  assert.equal(hexToBytes("deadbeef").length, 4);
});

test("hexToBytes rejects an invalid hex character", () => {
  assert.throws(() => hexToBytes("0xzz"), /invalid character/);
});

test("hexToBytes is the inverse of bytesToHex", () => {
  const original = new Uint8Array([0x00, 0x01, 0x7f, 0x80, 0xff]);
  const round = hexToBytes(bytesToHex(original));
  assert.equal(round.length, original.length);
  for (let i = 0; i < original.length; i++) assert.equal(round[i], original[i]);
});

test("isHex accepts the right length and rejects the wrong one", () => {
  assert.equal(isHex("0x" + "ab".repeat(20), 20), true);
  assert.equal(isHex("0x" + "ab".repeat(19), 20), false);
  assert.equal(isHex("0x" + "ab".repeat(21), 20), false);
});

test("isHex rejects strings without the 0x prefix", () => {
  assert.equal(isHex("ab".repeat(20), 20), false);
});

test("isHex rejects strings with non-hex characters", () => {
  assert.equal(isHex("0x" + "zz".repeat(20), 20), false);
});
