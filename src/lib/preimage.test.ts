import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  generatePreimage,
  hashPreimage,
  isValidPreimage,
  normalizePreimage,
  preimageFromBytes,
  preimageFromHex,
  verifyPreimage,
  type Hex32,
} from "./preimage.ts";

const PIN_PREIMAGE: Hex32 = "0x0000000000000000000000000000000000000000000000000000000000c0ffee";
const PIN_HASH: Hex32 = "0x5b20697604703c31c910b528899cfcd8fc4b623c0582032d0fa8fb854ed48017";

test("isValidPreimage accepts a 32-byte hex string", () => {
  assert.equal(isValidPreimage(PIN_PREIMAGE), true);
  assert.equal(isValidPreimage("0x" + "ab".repeat(32)), true);
});

test("isValidPreimage rejects anything that is not 32 bytes", () => {
  assert.equal(isValidPreimage("0x1234"), false);
  assert.equal(isValidPreimage("0x" + "ab".repeat(31)), false);
  assert.equal(isValidPreimage("0x" + "ab".repeat(33)), false);
  assert.equal(isValidPreimage("not a preimage"), false);
});

test("normalizePreimage lowercases the input", () => {
  const upper = "0x" + "AB".repeat(32);
  assert.equal(normalizePreimage(upper), ("0x" + "ab".repeat(32)) as Hex32);
});

test("normalizePreimage rejects malformed input", () => {
  assert.throws(() => normalizePreimage("0xZZ"));
});

test("preimageFromBytes requires exactly 32 bytes", () => {
  assert.equal(preimageFromBytes(new Uint8Array(32)), "0x" + "00".repeat(32));
  assert.throws(() => preimageFromBytes(new Uint8Array(31)));
  assert.throws(() => preimageFromBytes(new Uint8Array(33)));
});

test("preimageFromHex normalizes the casing", () => {
  const upper = "0x" + "AB".repeat(32);
  assert.equal(preimageFromHex(upper), ("0x" + "ab".repeat(32)) as Hex32);
});

test("preimageFromHex rejects wrong length or non-hex characters", () => {
  assert.throws(() => preimageFromHex("0x" + "ab".repeat(31)));
  assert.throws(() => preimageFromHex("0x" + "ab".repeat(33)));
  assert.throws(() => preimageFromHex("0x" + "zz".repeat(32)));
});

test("generatePreimage uses the supplied random source and produces 32 bytes", () => {
  const source = (length: number) => new Uint8Array(length).fill(0xab);
  const preimage = generatePreimage(source);
  assert.equal(preimage, ("0x" + "ab".repeat(32)) as Hex32);
});

test("generatePreimage rejects a random source that returns the wrong length", () => {
  const source = () => new Uint8Array(16);
  assert.throws(() => generatePreimage(source), /exactly 32 bytes/);
});

test("hashPreimage matches the pinned vector for the test preimage", async () => {
  const hash = await hashPreimage(PIN_PREIMAGE);
  assert.equal(hash, PIN_HASH);
});

test("hashPreimage is deterministic for the same input", async () => {
  const a = await hashPreimage(PIN_PREIMAGE);
  const b = await hashPreimage(PIN_PREIMAGE);
  assert.equal(a, b);
});

test("hashPreimage changes with even a single flipped byte", async () => {
  const flipped: Hex32 = ("0x" + "00".repeat(31) + "01") as Hex32;
  const a = await hashPreimage(PIN_PREIMAGE);
  const b = await hashPreimage(flipped);
  assert.notEqual(a, b);
});

test("verifyPreimage is true for the pinned pair", async () => {
  assert.equal(await verifyPreimage(PIN_PREIMAGE, PIN_HASH), true);
});

test("verifyPreimage is false for a mismatched pair", async () => {
  const wrong = "0x" + "00".repeat(32) as Hex32;
  assert.equal(await verifyPreimage(PIN_PREIMAGE, wrong), false);
});
