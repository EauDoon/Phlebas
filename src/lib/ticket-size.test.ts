import assert from "node:assert/strict";
import test from "node:test";

import { sizeAtomsForQuote } from "./units.ts";
import { maxTicketSizeAtoms } from "./ticket-size.ts";

test("sell max is available ZEC and ignores quote inventory", () => {
  assert.equal(
    maxTicketSizeAtoms({
      side: "sell",
      availableZecAtoms: 100_00000000n,
      availableQuoteAtoms: 10_000_000000n,
      priceTicks: 5311n,
    }),
    100_00000000n,
  );
  assert.equal(
    maxTicketSizeAtoms({
      side: "sell",
      availableZecAtoms: 0n,
      availableQuoteAtoms: 10_000_000000n,
      priceTicks: 5311n,
    }),
    0n,
  );
});

test("buy max inverts quote inventory at the integer bound", () => {
  const quoteAtoms = 10_000_000000n;
  const priceTicks = 5311n;
  assert.equal(
    maxTicketSizeAtoms({
      side: "buy",
      availableZecAtoms: 100_00000000n,
      availableQuoteAtoms: quoteAtoms,
      priceTicks,
    }),
    sizeAtomsForQuote(quoteAtoms, priceTicks),
  );
  assert.ok(sizeAtomsForQuote(quoteAtoms, priceTicks) > 0n);
});

test("buy max is zero when quote inventory or price is missing", () => {
  assert.equal(
    maxTicketSizeAtoms({
      side: "buy",
      availableZecAtoms: 100_00000000n,
      availableQuoteAtoms: 0n,
      priceTicks: 5311n,
    }),
    0n,
  );
  assert.equal(
    maxTicketSizeAtoms({
      side: "buy",
      availableZecAtoms: 100_00000000n,
      availableQuoteAtoms: 10_000_000000n,
      priceTicks: 0n,
    }),
    0n,
  );
});
