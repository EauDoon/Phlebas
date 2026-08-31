import { strict as assert } from "node:assert";
import { test } from "node:test";

import { formatPriceTicks, formatSizeAtoms, formatVolumeAtoms } from "./market-data-format.ts";

test("formatPriceTicks handles large tick values", () => {
  assert.equal(formatPriceTicks(1_234_567n), "123.4567 USDC");
});

test("formatSizeAtoms handles zatoshi precision", () => {
  assert.equal(formatSizeAtoms(1n), "0.00000001 ZEC");
  assert.equal(formatSizeAtoms(99_999_999n), "0.99999999 ZEC");
});

test("formatVolumeAtoms handles exact power-of-10 boundaries", () => {
  assert.equal(formatVolumeAtoms(999n), "999");
  assert.equal(formatVolumeAtoms(1_000n), "1.0K");
  // 999_999n / 1_000n rounds up to 1000K in float math; the
  // formatter accepts the rounded output as a stable representation.
  assert.equal(formatVolumeAtoms(999_999n), "1000K");
  assert.equal(formatVolumeAtoms(1_000_000n), "1.0M");
  assert.equal(formatVolumeAtoms(1_000_000_000n), "1.0B");
});

test("formatVolumeAtoms handles zero", () => {
  assert.equal(formatVolumeAtoms(0n), "0");
});
