import assert from "node:assert/strict";
import test from "node:test";

import {
  formatZecPreviewAmount,
  marketOrderConstraintCopy,
  sideControlCopy,
  formatQuotePreviewAmount,
  parseStrictDecimal,
  ZEC_ATOMIC_RULE,
  QUOTE_PRICE_ATOMIC_RULE,
  QUOTE_TOKEN_ATOMIC_RULE,
  previewQuoteAtoms,
  formatQuoteAtoms,
} from "./order.ts";
import { meetsMinimumQuoteSettlement, quoteAtomsForFill } from "./units.ts";

test("parses only explicit finite decimal syntax", () => {
  assert.equal(parseStrictDecimal("10.25"), 10.25);
  assert.equal(parseStrictDecimal("0", { allowZero: true }), 0);
  for (const unsafe of ["", " ", "0x10", "1e2", ".5", "5.", "+5", "Infinity"]) {
    assert.throws(() => parseStrictDecimal(unsafe), /decimal notation|preview range/);
  }
  assert.throws(() => parseStrictDecimal("0"), /positive/);
  assert.throws(() => parseStrictDecimal("100", { allowZero: true, maximumExclusive: 100 }), /below 100/);
  assert.throws(() => parseStrictDecimal("1".repeat(129)), /outside the preview range/);
});

test("calculates a positive preview notional through the engine's own arithmetic", () => {
  // The float multiply-and-display path is gone (review-5): the ticket's
  // estimated value comes from previewQuoteAtoms, the same integer
  // arithmetic the engine settles with, on the ticket's side.
  assert.equal(previewQuoteAtoms(5025n, 200_000_000n, "buy"), 100_500_000n);
  assert.equal(formatQuoteAtoms(previewQuoteAtoms(5025n, 200_000_000n, "buy")), "100.50");
});

test("enforces exact order-input atomic precision", () => {
  assert.equal(parseStrictDecimal("0.01", { atomicRule: QUOTE_PRICE_ATOMIC_RULE }), 0.01);
  assert.equal(parseStrictDecimal("0.00000001", { atomicRule: ZEC_ATOMIC_RULE }), 0.00000001);
  assert.equal(parseStrictDecimal("0.000001", { atomicRule: QUOTE_TOKEN_ATOMIC_RULE }), 0.000001);
  assert.throws(
    () => parseStrictDecimal("0.001", { atomicRule: QUOTE_PRICE_ATOMIC_RULE }),
    /no more than 2 decimal places/,
  );
  assert.throws(
    () => parseStrictDecimal("0.000000001", { atomicRule: ZEC_ATOMIC_RULE }),
    /no more than 8 decimal places/,
  );
  assert.throws(
    () => parseStrictDecimal("0.0000001", { atomicRule: QUOTE_TOKEN_ATOMIC_RULE }),
    /no more than 6 decimal places/,
  );
});

test("never formats accepted atomic amounts as zero", () => {
  assert.equal(formatZecPreviewAmount(0.00000001), "0.00000001");
  assert.equal(formatQuotePreviewAmount(Number(QUOTE_TOKEN_ATOMIC_RULE.minimumAtomicUnits) / 1_000_000), "0.000001");
  assert.throws(() => formatZecPreviewAmount(0.000000001), /at least 0.00000001/);
});

test("side control copy names Buy and Sell without color-only selection", () => {
  assert.equal(sideControlCopy("buy", false), "Buy");
  assert.equal(sideControlCopy("sell", false), "Sell");
  assert.equal(sideControlCopy("buy", true), "Buy selected");
  assert.equal(sideControlCopy("sell", true), "Sell selected");
  assert.notEqual(sideControlCopy("buy", true), sideControlCopy("sell", true));
  assert.match(sideControlCopy("buy", true), /Buy/);
  assert.match(sideControlCopy("sell", true), /Sell/);
  assert.doesNotMatch(sideControlCopy("buy", true), /pZEC/);
});

test("market-order constraint copy names IOC and a signed worst price", () => {
  assert.match(marketOrderConstraintCopy(), /IOC with a signed worst price/);
  assert.match(marketOrderConstraintCopy(), /no unbounded market instruction/);
  assert.match(marketOrderConstraintCopy(), /not live settlement/);
  assert.doesNotMatch(marketOrderConstraintCopy(), /pZEC/);
  assert.doesNotMatch(marketOrderConstraintCopy(), /trustless/);
});

test("previewQuoteAtoms matches what the engine would settle, on the right side", () => {
  // 777.77 * 77.77777777 is 60493.2222166... in exact arithmetic. A buy
  // is charged the rounded-up 60493.222217; a sell receives the rounded-
  // down 60493.222216. The float preview showed the sell figure to both.
  const priceTicks = 77_777n;
  const sizeAtoms = 7_777_777_777n;
  assert.equal(previewQuoteAtoms(priceTicks, sizeAtoms, "buy"), 60_493_222_217n);
  assert.equal(previewQuoteAtoms(priceTicks, sizeAtoms, "sell"), 60_493_222_216n);
  assert.equal(formatQuoteAtoms(previewQuoteAtoms(priceTicks, sizeAtoms, "buy")), "60493.222217");
  assert.equal(formatQuoteAtoms(previewQuoteAtoms(priceTicks, sizeAtoms, "sell")), "60493.222216");
});

test("previewQuoteAtoms is side-aware at the smallest settleable notional", () => {
  // The smallest order the engine admits settles for exactly one quote
  // atom on either side. One atom of size above it, a buy pays two and a
  // sell receives one, which is the whole reason the side has to be known.
  assert.equal(previewQuoteAtoms(1n, 10_000n, "buy"), 1n);
  assert.equal(previewQuoteAtoms(1n, 10_000n, "sell"), 1n);
  assert.equal(previewQuoteAtoms(1n, 10_001n, "buy"), 2n);
  assert.equal(previewQuoteAtoms(1n, 10_001n, "sell"), 1n);
  assert.equal(formatQuoteAtoms(previewQuoteAtoms(1n, 10_000n, "buy")), "0.000001");
});

test("previewQuoteAtoms rejects a notional the engine would not settle", () => {
  // The gate is the engine's own: sizeAtoms * priceTicks must reach one
  // quote atom before rounding, on either side.
  assert.throws(() => previewQuoteAtoms(1n, 1n, "buy"), /at least one quote atom/);
  assert.throws(() => previewQuoteAtoms(1n, 9_999n, "sell"), /at least one quote atom/);
  assert.equal(previewQuoteAtoms(1n, 10_000n, "sell"), 1n);
});

test("previewQuoteAtoms rejects a non-positive price or size", () => {
  assert.throws(() => previewQuoteAtoms(0n, 100_000_000n, "buy"), /Price must be at least/);
  assert.throws(() => previewQuoteAtoms(100n, 0n, "buy"), /Size must be at least/);
});

test("previewQuoteAtoms agrees with the engine across a sweep of prices and sizes", () => {
  for (let priceTicks = 1n; priceTicks <= 400n; priceTicks += 7n) {
    for (let sizeAtoms = 1n; sizeAtoms <= 4_000_000n; sizeAtoms += 137_921n) {
      if (!meetsMinimumQuoteSettlement(sizeAtoms, priceTicks)) continue;
      assert.equal(previewQuoteAtoms(priceTicks, sizeAtoms, "buy"), quoteAtomsForFill(sizeAtoms, priceTicks, "up"));
      assert.equal(previewQuoteAtoms(priceTicks, sizeAtoms, "sell"), quoteAtomsForFill(sizeAtoms, priceTicks, "down"));
    }
  }
});
