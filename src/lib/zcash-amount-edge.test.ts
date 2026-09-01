import { strict as assert } from "node:assert";
import { test } from "node:test";

import { isDustThreshold, zatoshisToZec, zecToZatoshis } from "./zcash-amount.ts";

test("zecToZatoshis at zero returns zero", () => {
  assert.equal(zecToZatoshis(0n), 0n);
});

test("zatoshisToZec at zero returns zero", () => {
  assert.equal(zatoshisToZec(0n), 0n);
});

test("zecToZatoshis and zatoshisToZec round-trip across large values", () => {
  for (const zec of [0n, 1n, 1_000n, 1_000_000n, 21_000_000n]) {
    const zat = zecToZatoshis(zec);
    assert.equal(zatoshisToZec(zat), zec);
  }
});

test("zecToZatoshis accepts a numeric number that is a whole integer", () => {
  assert.equal(zecToZatoshis(2n), 200_000_000n);
});

test("isDustThreshold is true for the smallest non-zero amount", () => {
  assert.equal(isDustThreshold(1n), true);
});

test("isDustThreshold is false at exactly 1000 zatoshis and above", () => {
  assert.equal(isDustThreshold(1_000n), false);
  assert.equal(isDustThreshold(1_001n), false);
  assert.equal(isDustThreshold(10_000n), false);
});
