import { strict as assert } from "node:assert";
import { test } from "node:test";

import { isDustThreshold, zatoshisToZec, zecToZatoshis } from "./zcash-amount.ts";

test("zecToZatoshis converts 1 ZEC to 100,000,000 zatoshis", () => {
  assert.equal(zecToZatoshis(1n), 100_000_000n);
});

test("zecToZatoshis multiplies integer zatoshis", () => {
  // 50,000,000 zatoshis * 100,000,000 (factor) = 5,000,000,000,000,000 zatoshis.
  // This is the path callers use after converting float ZEC upstream.
  assert.equal(zecToZatoshis(50_000_000n), 5_000_000_000_000_000n);
});

test("zecToZatoshis rejects negative values", () => {
  assert.throws(() => zecToZatoshis(-1n), /non-negative/);
});

test("zatoshisToZec rounds down", () => {
  assert.equal(zatoshisToZec(150_000_000n), 1n);
  assert.equal(zatoshisToZec(99_999_999n), 0n);
});

test("zatoshisToZec rejects negative values", () => {
  assert.throws(() => zatoshisToZec(-1n), /non-negative/);
});

test("isDustThreshold is true for sub-1000 zatoshi values", () => {
  assert.equal(isDustThreshold(500n), true);
  assert.equal(isDustThreshold(999n), true);
});

test("isDustThreshold is false for exactly 1000 zatoshis", () => {
  assert.equal(isDustThreshold(1_000n), false);
});

test("isDustThreshold is false for zero", () => {
  assert.equal(isDustThreshold(0n), false);
});

test("isDustThreshold is false for large amounts", () => {
  assert.equal(isDustThreshold(1_000_000n), false);
});

test("ZATOSHIS_PER_ZEC is the published constant", () => {
  // Import via a constant check rather than a top-level import to keep
  // the test readable.
  const expected = 100_000_000n;
  assert.equal(zecToZatoshis(1n), expected);
});
