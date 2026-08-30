import assert from "node:assert/strict";
import test from "node:test";

import { pools } from "./market-data.ts";
import { compareVenues, quoteClob } from "./router.ts";
import { seedBook } from "./session.ts";

test("CLOB preview does not mutate the seeded book", () => {
  const book = seedBook("ZEC/USDC");
  const before = book.asks.length;
  const quote = quoteClob(book, "buy", 1_00000000n, 5291n);
  assert.equal(quote.complete, true);
  assert.equal(quote.quoteAtoms, 52_910000n);
  assert.equal(book.asks.length, before);
});

test("buy comparison prefers the cheaper complete venue", () => {
  const book = seedBook("ZEC/USDC");
  const comparison = compareVenues({
    book,
    side: "buy",
    sizeAtoms: 1_00000000n,
    limitTicks: 5310n,
    reservePzecAtoms: pools[0].reserveZecAtoms,
    reserveQuoteAtoms: pools[0].reserveQuoteAtoms,
  });
  assert.equal(comparison.clob.complete, true);
  assert.equal(comparison.amm.complete, true);
  assert.notEqual(comparison.better, "none");
});
