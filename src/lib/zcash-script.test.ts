import { strict as assert } from "node:assert";
import { test } from "node:test";

import { concatBytes, OP, pushData, pushNumber } from "./zcash-script.ts";

test("pushData emits OP_PUSHBYTES_N for short payloads", () => {
  const out = pushData(new Uint8Array([0xab, 0xcd]));
  assert.equal(out.length, 3);
  assert.equal(out[0], 2);
  assert.equal(out[1], 0xab);
  assert.equal(out[2], 0xcd);
});

test("pushData emits OP_PUSHDATA1 for medium payloads", () => {
  const data = new Uint8Array(80);
  for (let i = 0; i < data.length; i++) data[i] = i;
  const out = pushData(data);
  assert.equal(out[0], 0x4c);
  assert.equal(out[1], 80);
  assert.equal(out.length, 82);
});

test("pushData emits OP_PUSHDATA2 for larger payloads", () => {
  const data = new Uint8Array(300);
  const out = pushData(data);
  assert.equal(out[0], 0x4d);
  assert.equal(out[1], 0x2c);
  assert.equal(out[2], 0x01);
  assert.equal(out.length, 303);
});

test("pushNumber serializes zero as OP_0 via the 5-byte form", () => {
  const out = pushNumber(0n);
  assert.equal(out.length, 5);
  assert.equal(out[0], 0x4f);
});

test("pushNumber serializes small positive integers as a length-prefixed LE sequence", () => {
  const out = pushNumber(1n);
  // OP_PUSHBYTES_1 0x01
  assert.equal(out[0], 1);
  assert.equal(out[1], 1);
});

test("pushNumber serializes 5 without a sign byte because the high bit is clear", () => {
  const out = pushNumber(5n);
  // OP_PUSHBYTES_1 0x05 — no sign byte needed because 0x05 & 0x80 == 0
  assert.equal(out[0], 1);
  assert.equal(out[1], 5);
  assert.equal(out.length, 2);
});

test("pushNumber adds a sign byte when the high bit is set", () => {
  const out = pushNumber(0x80n);
  // OP_PUSHBYTES_2 then 0x00 then 0x80 — the trailing 0x00 keeps the value positive
  assert.equal(out[0], 2);
  assert.equal(out[1], 0);
  assert.equal(out[2], 0x80);
});

test("pushNumber rejects negative numbers", () => {
  assert.throws(() => pushNumber(-1n), /negative/);
});

test("concatBytes stitches parts in order", () => {
  const a = new Uint8Array([1, 2]);
  const b = new Uint8Array([3]);
  const c = new Uint8Array([4, 5, 6]);
  const out = concatBytes([a, b, c]);
  assert.equal(out.length, 6);
  for (let i = 0; i < 6; i++) assert.equal(out[i], i + 1);
});

test("OP table exports the canonical Bitcoin/Zcash opcodes", () => {
  assert.equal(OP.OP_HASH160, 0xa9);
  assert.equal(OP.OP_EQUAL, 0x87);
  assert.equal(OP.OP_EQUALVERIFY, 0x88);
  assert.equal(OP.OP_CHECKSIG, 0xac);
  assert.equal(OP.OP_CHECKLOCKTIMEVERIFY, 0xb1);
  assert.equal(OP.OP_IF, 0x63);
  assert.equal(OP.OP_ELSE, 0x67);
  assert.equal(OP.OP_ENDIF, 0x68);
});
