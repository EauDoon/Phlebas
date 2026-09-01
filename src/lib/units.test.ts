import assert from "node:assert/strict";
import test from "node:test";

import {
  formatAtomicUnits,
  meetsMinimumQuoteSettlement,
  minimumSizeAtomsForQuoteSettlement,
  parseAtomicUnits,
  PRICE_DECIMALS,
  QUOTE_DECIMALS,
  quoteAtomsForFill,
  quoteAtomsForFills,
  sizeAtomsForQuote,
  worstPriceTicks,
  ZEC_DECIMALS,
} from "./units.ts";

test("ZEC_DECIMALS is 8", () => {
  assert.equal(ZEC_DECIMALS, 8);
  assert.equal(PRICE_DECIMALS, 2);
  assert.equal(QUOTE_DECIMALS, 6);
});

test("formats and parses 8-decimal ZEC atoms", () => {
  assert.equal(formatAtomicUnits(1n, 8), "0.00000001");
  assert.equal(formatAtomicUnits(10_00000000n, 8), "10");
  assert.equal(formatAtomicUnits(10_00000000n, 8, 2), "10.00");
  assert.equal(parseAtomicUnits("10.5", 8), 10_50000000n);
  assert.equal(parseAtomicUnits("0.00000001", 8), 1n);
});

test("formats prices as 0.01 ticks", () => {
  assert.equal(formatAtomicUnits(5284n, 2, 2), "52.84");
  assert.equal(parseAtomicUnits("52.84", 2), 5284n);
});

test("converts one ZEC at 52.84 to 52.84 quote atoms", () => {
  const quoteAtoms = quoteAtomsForFill(100_000000n, 5284n, "up");
  assert.equal(quoteAtoms, 52_840000n);
  assert.equal(formatAtomicUnits(quoteAtoms, 6, 2), "52.84");
  assert.equal(sizeAtomsForQuote(quoteAtoms, 5284n), 100_000000n);
});

test("uses explicit side-aware rounding after aggregating every fill", () => {
  assert.equal(quoteAtomsForFill(1n, 5291n, "down"), 0n);
  assert.equal(quoteAtomsForFill(1n, 5291n, "up"), 1n);
  const fills = [
    { sizeAtoms: 1n, priceTicks: 5291n },
    { sizeAtoms: 1n, priceTicks: 5297n },
  ];
  assert.equal(quoteAtomsForFills(fills, "down"), 1n);
  assert.equal(quoteAtomsForFills(fills, "up"), 2n);
  assert.equal(quoteAtomsForFills([], "up"), 0n);
});

test("rejects extra precision and empty strings", () => {
  assert.throws(() => parseAtomicUnits("0.001", 2), /no more than 2 decimal places/);
  assert.throws(() => parseAtomicUnits("", 8), /plain decimal notation/);
  assert.throws(() => parseAtomicUnits("0", 8), /at least 0.00000001/);
  assert.equal(parseAtomicUnits("0", 8, { allowZero: true }), 0n);
  assert.throws(() => formatAtomicUnits(-1n, 8), /negative/);
  assert.throws(() => formatAtomicUnits(1n, 2, 3), /preview range/);
});

test("integer worst buy price rounds up to the next tick", () => {
  assert.equal(worstPriceTicks(5284n, "buy", 50n), 5311n);
  assert.equal(worstPriceTicks(5000n, "sell", 50n), 4975n);
  assert.equal(worstPriceTicks(5284n, "buy", 0n), 5284n);
  assert.equal(worstPriceTicks(5284n, "sell", 0n), 5284n);
});

test("minimum quote settlement is one quote atom", () => {
  assert.equal(meetsMinimumQuoteSettlement(1n, 5291n), false);
  assert.equal(meetsMinimumQuoteSettlement(2n, 5291n), true);
  assert.equal(minimumSizeAtomsForQuoteSettlement(5284n), 2n);
  assert.equal(minimumSizeAtomsForQuoteSettlement(10_000n), 1n);
  assert.throws(() => minimumSizeAtomsForQuoteSettlement(0n), /positive price/);
});
