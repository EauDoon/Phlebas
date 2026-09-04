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
  previewQuoteAtoms,
  formatQuoteAtoms,
} from "./order.ts";
import { meetsMinimumQuoteSettlement, quoteAtomsForFill, worstPriceTicks } from "./units.ts";

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

test("the float worst-price preview agrees with the signed worst-price primitive", () => {
  // The ticket displays the market-order worst price from
  // calculateWorstPrice (float) while the order is signed with
  // worstPriceTicks (exact). Two implementations of one primitive is a
  // divergence hazard, and the divergence is real: at extreme slippage
  // the float error escapes the rounding tolerance and the displayed
  // tick differs from the signed tick.
  const divergentCases = [
    { ticks: 410_263_000n, slippageHundredths: 9620n, side: "sell" as const },
    { ticks: 310_644_000n, slippageHundredths: 9845n, side: "sell" as const },
    { ticks: 436_615_000n, slippageHundredths: 9268n, side: "sell" as const },
  ];
  for (const { ticks, slippageHundredths, side } of divergentCases) {
    const displayed = calculateWorstPrice(Number(ticks) / 100, side, Number(slippageHundredths) / 100);
    const signed = worstPriceTicks(ticks, side, slippageHundredths);
    assert.equal(Math.round(displayed * 100), Number(signed), `ticks=${ticks} slippage=${slippageHundredths}`);
  }

  // Across realistic ranges the two must agree tick-for-tick, and must
  // throw on exactly the same inputs.
  for (let ticks = 1n; ticks <= 20_000n; ticks += 97n) {
    for (let slippageHundredths = 0n; slippageHundredths < 2000n; slippageHundredths += 13n) {
      for (const side of ["buy", "sell"] as const) {
        let displayed: number;
        let signed: bigint;
        try {
          displayed = calculateWorstPrice(Number(ticks) / 100, side, Number(slippageHundredths) / 100);
        } catch {
          assert.throws(() => worstPriceTicks(ticks, side, slippageHundredths));
          continue;
        }
        signed = worstPriceTicks(ticks, side, slippageHundredths);
        assert.equal(Math.round(displayed * 100), Number(signed), `ticks=${ticks} slippage=${slippageHundredths} side=${side}`);
      }
    }
  }
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

test("rejects an unsafe slippage percentage", () => {
  assert.throws(() => calculateWorstPrice(50, "sell", 100), /between 0 and 100/);
});

test("rejects non-finite, overflowing, and rounded-to-zero worst prices", () => {
  assert.throws(() => calculateWorstPrice(Number.MAX_VALUE, "buy", 99), /outside the preview range/);
  assert.throws(() => calculateWorstPrice(1e308, "sell", 99), /outside the preview range/);
  assert.throws(() => calculateWorstPrice(0.01, "sell", 99), /outside the preview range/);
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
