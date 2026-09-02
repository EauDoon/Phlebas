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

test("pushNumber serializes zero as the single byte OP_0", () => {
  // The canonical CScriptNum zero is an empty push, which is OP_0 (0x00).
  // The old five-byte form began 0x4f, which is OP_1NEGATE: it pushed -1
  // and then executed four separate OP_0 opcodes.
  const out = pushNumber(0n);
  assert.equal(out.length, 1);
  assert.equal(out[0], OP.OP_FALSE);
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

test("pushNumber appends the sign byte after the most significant byte", () => {
  // CScriptNum is little-endian sign-and-magnitude, so the sign lives in
  // the top bit of the LAST byte and the 0x00 pad has to follow 0x80
  // rather than precede it. Emitting 00 80 pushes the little-endian value
  // 0x8000, whose top bit is set, which the engine reads as negative.
  const out = pushNumber(0x80n);
  assert.deepEqual([...out], [2, 0x80, 0x00]);
});

test("pushNumber emits the minimal little-endian encoding", () => {
  assert.deepEqual([...pushNumber(1000n)], [2, 0xe8, 0x03]);
  assert.deepEqual([...pushNumber(255n)], [2, 0xff, 0x00]);
  assert.deepEqual([...pushNumber(256n)], [2, 0x00, 0x01]);
  assert.deepEqual([...pushNumber(0x7fn)], [1, 0x7f]);
  assert.deepEqual([...pushNumber(4294967295n)], [5, 0xff, 0xff, 0xff, 0xff, 0x00]);
});

test("pushNumber matches a reference CScriptNum across the uint32 lock-time domain", () => {
  // The previous encoder tested the wrong end of the buffer for the sign
  // bit, so every value whose low byte had bit 7 set gained a leading pad
  // and came out multiplied by 256, and a value whose real high byte had
  // bit 7 set lost its pad and read back negative. That is half the
  // domain, and the operand is committed into the P2SH lock address.
  const reference = (value: bigint): number[] => {
    const little: number[] = [];
    let n = value;
    while (n > 0n) {
      little.push(Number(n & 0xffn));
      n >>= 8n;
    }
    if (little.length > 0 && ((little[little.length - 1] ?? 0) & 0x80) !== 0) little.push(0x00);
    return [little.length, ...little];
  };
  const values = [0n, 1n, 127n, 128n, 255n, 256n, 32767n, 32768n, 8388607n, 8388608n,
    2147483647n, 2147483648n, 4294967295n, 500_000_000n, 1_767_225_728n, 12_896_896n];
  for (let i = 0; i < 512; i += 1) values.push(BigInt(i) * 8_388_593n % 4_294_967_296n);
  for (const value of values) {
    assert.deepEqual([...pushNumber(value)], reference(value), `push of ${value}`);
  }
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
