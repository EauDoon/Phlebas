import assert from "node:assert/strict";
import test from "node:test";

import {
  formatAtomicUnits,
  parseAtomicUnits,
  quoteAtomsForFill,
  sizeAtomsForQuote,
} from "./units.ts";

test("formats and parses 8-decimal pZEC atoms", () => {
  assert.equal(formatAtomicUnits(1n, 8), "0.00000001");
  assert.equal(formatAtomicUnits(10_00000000n, 8), "10");
  assert.equal(parseAtomicUnits("10.5", 8), 10_50000000n);
  assert.equal(parseAtomicUnits("0.00000001", 8), 1n);
});

test("formats prices as 0.01 ticks", () => {
  assert.equal(formatAtomicUnits(5284n, 2, 2), "52.84");
  assert.equal(parseAtomicUnits("52.84", 2), 5284n);
});

test("converts one pZEC at 52.84 to 52.84 quote atoms", () => {
  const quoteAtoms = quoteAtomsForFill(100_000000n, 5284n);
  assert.equal(quoteAtoms, 52_840000n);
  assert.equal(formatAtomicUnits(quoteAtoms, 6, 2), "52.84");
  assert.equal(sizeAtomsForQuote(quoteAtoms, 5284n), 100_000000n);
});

test("rejects extra precision and empty strings", () => {
  assert.throws(() => parseAtomicUnits("0.001", 2), /no more than 2 decimal places/);
  assert.throws(() => parseAtomicUnits("", 8), /plain decimal notation/);
  assert.throws(() => parseAtomicUnits("0", 8), /at least 0.00000001/);
});
