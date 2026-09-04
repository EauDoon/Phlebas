import assert from "node:assert/strict";
import test from "node:test";

import {
  balancedQuoteAtoms,
  feeAdjustedProductHolds,
  quoteConstantProductAmountIn,
  quoteConstantProductSwap,
  quoteConstantProductSwapAtoms,
} from "./amm.ts";

test("quotes a constant product swap with a 30 basis point fee", () => {
  const amountIn = 10;
  const reserveIn = 1_000;
  const reserveOut = 50_000;
  const feeBps = 30;
  const quote = quoteConstantProductSwap(amountIn, reserveIn, reserveOut, feeBps);
  const amountAfterFee = amountIn * (10_000 - feeBps) / 10_000;
  const expectedOut = reserveOut * amountAfterFee / (reserveIn + amountAfterFee);
  const kBefore = reserveIn * reserveOut;
  const kAfter = (reserveIn + amountIn) * (reserveOut - quote.amountOut);

  const amountTolerance = Number.EPSILON * Math.abs(expectedOut) * 4;
  assert.ok(Math.abs(quote.amountOut - expectedOut) <= amountTolerance);
  assert.ok(Math.abs(quote.feePaid - (amountIn - amountAfterFee)) <= Number.EPSILON * 8);
  assert.ok(quote.priceImpactPercent > 0);
  assert.ok(quote.priceImpactPercent < 1);
  assert.ok(kAfter >= kBefore);
});

test("keeps the fee-adjusted product from falling on the preview path", () => {
  const quote = quoteConstantProductSwap(10, 1_000, 50_000, 30);
  const x = 1_000 + 10;
  const y = 50_000 - quote.amountOut;
  const feeAdjusted = (x * 10_000 - 10 * 30) * (y * 10_000);
  const baseline = 1_000 * 50_000 * 10_000 * 10_000;

  assert.ok(feeAdjusted >= baseline);
});

test("returns an empty quote for a zero input", () => {
  assert.deepEqual(quoteConstantProductSwap(0, 1_000, 50_000), {
    amountOut: 0,
    feePaid: 0,
    priceImpactPercent: 0,
  });
});

test("rejects invalid reserves", () => {
  assert.throws(
    () => quoteConstantProductSwap(1, 0, 50_000),
    /reserves must be positive/,
  );
  assert.throws(
    () => quoteConstantProductSwap(1, Number.POSITIVE_INFINITY, 50_000),
    /reserves must be positive/,
  );
});

test("reports curve impact separately from the swap fee", () => {
  const quote = quoteConstantProductSwap(0.0001, 1_000, 50_000, 30);

  assert.equal(Number(quote.feePaid.toFixed(10)), 0.0000003);
  assert.ok(quote.priceImpactPercent < 0.001);
});

test("keeps large finite multiplication paths finite", () => {
  const quote = quoteConstantProductSwap(1e200, 1e200, 1e200, 30);

  assert.ok(Number.isFinite(quote.amountOut));
  assert.ok(Number.isFinite(quote.feePaid));
  assert.ok(Number.isFinite(quote.priceImpactPercent));
});

test("rejects an extreme ratio that cannot produce a finite preview", () => {
  assert.throws(
    () => quoteConstantProductSwap(Number.MAX_VALUE, Number.MIN_VALUE, 1, 30),
    /outside the preview range/,
  );
});

test("quotes an integer Uniswap v2 swap without IEEE rounding", () => {
  const amountIn = 10_00000000n;
  const reserveIn = 797_132_000000n;
  const reserveOut = 421_205_000000n;
  const quote = quoteConstantProductSwapAtoms(amountIn, reserveIn, reserveOut, 30);

  const amountInWithFee = amountIn * 9970n;
  const expectedOut = (amountInWithFee * reserveOut) / ((reserveIn * 10_000n) + amountInWithFee);
  assert.equal(quote.amountOut, expectedOut);
  assert.equal(quote.feePaid, amountIn - (amountIn * 9970n / 10_000n));
  assert.ok(feeAdjustedProductHolds(amountIn, reserveIn, reserveOut, quote.amountOut, 30));
  assert.ok(quote.amountOut < reserveOut);
});

test("returns a zero integer quote for a zero input", () => {
  assert.deepEqual(quoteConstantProductSwapAtoms(0n, 1_000n, 50_000n), {
    amountOut: 0n,
    feePaid: 0n,
    amountIn: 0n,
  });
});

test("balanced add rounds the required quote contribution up, in favour of the pool", () => {
  // 2 * 421_205_000000 / 797_132_000000 = 1.0568..., a floor would let the
  // minter contribute only 1n while being credited a share computed from the
  // full 2n zec side, shorting the pool by the fractional remainder. Round up.
  assert.equal(balancedQuoteAtoms(2n, 797_132_000000n, 421_205_000000n), 2n);
});

test("balanced add is exact when the ratio divides evenly", () => {
  assert.equal(balancedQuoteAtoms(2n, 1_000n, 3_000n), 6n);
});

test("mint dilution: a minter can never withdraw more than they deposited on an immediate round trip, and existing LPs keep their exact value", () => {
  // Regression for the balancedQuoteAtoms floor-rounding bug: a depositor
  // could underpay the quote side of a mint (favouring the trader, not the
  // pool), letting them cash out later for strictly more than they put in
  // at the expense of the LP who was already in the pool. See lp.test.ts
  // "mint never lets a depositor extract more value than they contributed"
  // for the full mint/burn walk that catches this via the real lp.ts API.
  const reserveZecAtoms = 3n;
  const reserveQuoteAtoms = 10n;
  const zecAtoms = 1n;
  const quoteAtoms = balancedQuoteAtoms(zecAtoms, reserveZecAtoms, reserveQuoteAtoms);
  // Existing LP holds all of reserveQuoteAtoms via reserveZecAtoms shares.
  // After adding (zecAtoms, quoteAtoms), the existing LP's proportional
  // claim on the quote reserve must not have shrunk.
  const newReserveQuoteAtoms = reserveQuoteAtoms + quoteAtoms;
  const newTotalShares = reserveZecAtoms + zecAtoms; // shares track zec 1:1 in this design
  const existingLpQuoteClaim = (reserveZecAtoms * newReserveQuoteAtoms) / newTotalShares;
  assert.ok(existingLpQuoteClaim >= reserveQuoteAtoms);
});

test("rejects empty integer reserves", () => {
  assert.throws(() => quoteConstantProductSwapAtoms(1n, 0n, 50_000n), /reserves must be positive/);
});

test("amount-in inverse covers the requested amount out", () => {
  const reserveIn = 421_205_000000n;
  const reserveOut = 797_132_000000n;
  const amountOut = 1_00000000n;
  const amountIn = quoteConstantProductAmountIn(amountOut, reserveIn, reserveOut);
  const quoted = quoteConstantProductSwapAtoms(amountIn, reserveIn, reserveOut);
  assert.ok(quoted.amountOut >= amountOut);
});
