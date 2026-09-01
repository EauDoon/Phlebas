import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  formatPriceTicks,
  formatSignedChangeBps,
  formatSizeAtoms,
  formatVolumeAtoms,
} from "./market-data-format.ts";

test("formatPriceTicks formats tick-and-atom into a dollar string", () => {
  assert.equal(formatPriceTicks(5284n), "0.5284 USDC");
  assert.equal(formatPriceTicks("5284"), "0.5284 USDC");
  assert.equal(formatPriceTicks(12_345n), "1.2345 USDC");
  assert.equal(formatPriceTicks(0n), "0.0000 USDC");
});

test("formatPriceTicks accepts USDT0 quotes", () => {
  assert.equal(formatPriceTicks(5284n, "USDT0"), "0.5284 USDT0");
});

test("formatPriceTicks returns em-dash for null", () => {
  assert.equal(formatPriceTicks(null), "—");
});

test("formatPriceTicks rejects negative ticks", () => {
  assert.throws(() => formatPriceTicks(-1n));
});

test("formatSizeAtoms formats atom-and-zatoshi into a ZEC string", () => {
  assert.equal(formatSizeAtoms(1_000_000_000n), "10.00000000 ZEC");
  assert.equal(formatSizeAtoms(100_000_000n), "1.00000000 ZEC");
  assert.equal(formatSizeAtoms(0n), "0.00000000 ZEC");
});

test("formatSizeAtoms rejects negative atoms", () => {
  assert.throws(() => formatSizeAtoms(-1n));
});

test("formatSignedChangeBps formats bps into a signed percentage", () => {
  assert.equal(formatSignedChangeBps(585), "+5.85%");
  assert.equal(formatSignedChangeBps(-120), "-1.20%");
  assert.equal(formatSignedChangeBps(0), "0.00%");
});

test("formatSignedChangeBps rejects non-integers", () => {
  assert.throws(() => formatSignedChangeBps(1.5));
});

test("formatVolumeAtoms uses K/M/B suffixes for human-readable output", () => {
  assert.equal(formatVolumeAtoms(500n), "500");
  assert.equal(formatVolumeAtoms(1_500n), "1.5K");
  assert.equal(formatVolumeAtoms(2_500_000n), "2.5M");
  assert.equal(formatVolumeAtoms(3_500_000_000n), "3.5B");
});

test("formatVolumeAtoms rejects negative atoms", () => {
  assert.throws(() => formatVolumeAtoms(-1n));
});
