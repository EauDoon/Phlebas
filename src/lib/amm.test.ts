import assert from "node:assert/strict";
import test from "node:test";

import { quoteConstantProductSwap } from "./amm.ts";

test("quotes a constant product swap with a 30 basis point fee", () => {
  const quote = quoteConstantProductSwap(10, 1_000, 50_000, 30);

  assert.ok(quote.amountOut > 0);
  assert.ok(quote.amountOut < 500);
  assert.equal(Number(quote.feePaid.toFixed(3)), 0.03);
  assert.ok(quote.priceImpactPercent > 0);
  assert.ok(quote.priceImpactPercent < 1);
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
