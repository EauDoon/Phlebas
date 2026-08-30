import assert from "node:assert/strict";
import test from "node:test";

import { quoteConstantProductSwap } from "./amm.ts";

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
