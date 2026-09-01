import assert from "node:assert/strict";
import test from "node:test";

import {
  calculatePreviewNotional,
  calculateWorstPrice,
  formatZecPreviewAmount,
  marketOrderConstraintCopy,
  sideControlCopy,
  formatQuotePreviewAmount,
  parseStrictDecimal,
  ZEC_ATOMIC_RULE,
  QUOTE_PRICE_ATOMIC_RULE,
  QUOTE_TOKEN_ATOM,
  QUOTE_TOKEN_ATOMIC_RULE,
} from "./order.ts";

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

test("calculates a positive preview notional", () => {
  assert.equal(calculatePreviewNotional(50.25, 2), 100.5);
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

test("rejects negative price and size even when their product is positive", () => {
  assert.throws(() => calculatePreviewNotional(-50, -2), /Price must be positive/);
});

test("rejects zero, non-finite, and overflowing preview inputs", () => {
  assert.throws(() => calculatePreviewNotional(50, 0), /Size must be positive/);
  assert.throws(() => calculatePreviewNotional(Number.POSITIVE_INFINITY, 2), /Price must be positive/);
  assert.throws(() => calculatePreviewNotional(Number.MAX_VALUE, 2), /outside the preview range/);
});

test("rejects underflow, sub-tick price, sub-atom size, and sub-atom quote notional", () => {
  assert.throws(() => calculatePreviewNotional(Number.MIN_VALUE, 0.5), /outside the preview range/);
  assert.throws(() => calculatePreviewNotional(0.001, 1), /Price must be at least 0.01/);
  assert.throws(() => calculatePreviewNotional(1_000, 0.000000001), /Size must be at least 0.00000001/);
  assert.throws(() => calculatePreviewNotional(0.01, 0.00000001), /Notional must be at least 0.000001/);
  assert.throws(() => calculatePreviewNotional(1_000_000_000, 10), /outside the preview range/);
});

test("never formats accepted atomic amounts as zero", () => {
  assert.equal(formatZecPreviewAmount(0.00000001), "0.00000001");
  assert.equal(formatQuotePreviewAmount(QUOTE_TOKEN_ATOM), "0.000001");
  assert.throws(() => formatZecPreviewAmount(0.000000001), /at least 0.00000001/);
});

test("caps a market buy above the reference price", () => {
  assert.equal(calculateWorstPrice(50, "buy", 0.5), 50.25);
});

test("floors a market sell below the reference price", () => {
  assert.equal(calculateWorstPrice(50, "sell", 0.5), 49.75);
});

test("rounds market caps conservatively to the quote-price tick", () => {
  assert.equal(calculateWorstPrice(52.84, "buy", 0.5), 53.11);
  assert.equal(calculateWorstPrice(52.84, "sell", 0.5), 52.57);
  assert.equal(calculateWorstPrice(52.84, "buy", 0.001), 52.85);
  assert.equal(calculateWorstPrice(52.84, "sell", 0.001), 52.83);
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
  assert.doesNotMatch(marketOrderConstraintCopy(), /simulation|simulator|fixture/i);
});

test("rejects an unsafe slippage percentage", () => {
  assert.throws(() => calculateWorstPrice(50, "sell", 100), /between 0 and 100/);
});

test("rejects non-finite, overflowing, and rounded-to-zero worst prices", () => {
  assert.throws(() => calculateWorstPrice(Number.MAX_VALUE, "buy", 99), /outside the preview range/);
  assert.throws(() => calculateWorstPrice(1e308, "sell", 99), /outside the preview range/);
  assert.throws(() => calculateWorstPrice(0.01, "sell", 99), /outside the preview range/);
});
