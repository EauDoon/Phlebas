import assert from "node:assert/strict";
import test from "node:test";

import { quoteAtomsForFill } from "./units.ts";
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

test("buy max is the largest size collateralRequired can still afford, not one atom more", () => {
  // A prior version of this test asserted maxTicketSizeAtoms's buy branch
  // against sizeAtomsForQuote(quoteAtoms, priceTicks) -- the exact call the
  // implementation itself makes. That passed for any implementation that
  // called sizeAtomsForQuote with those two arguments, including one that
  // returned an unaffordable size, because it never checked the number
  // against what a buy actually costs (quoteAtomsForFill rounds up, per
  // session.ts collateralRequired/canCover). Check the real invariant
  // instead: the returned size must be affordable, and the next base atom
  // must not be.
  const quoteAtoms = 10_000_000000n;
  const priceTicks = 5311n;
  const maxSize = maxTicketSizeAtoms({
    side: "buy",
    availableZecAtoms: 100_00000000n,
    availableQuoteAtoms: quoteAtoms,
    priceTicks,
  });

  assert.equal(maxSize, 18_828_845_791n);
  assert.ok(maxSize > 0n);
  assert.ok(quoteAtomsForFill(maxSize, priceTicks, "up") <= quoteAtoms);
  assert.ok(quoteAtomsForFill(maxSize + 1n, priceTicks, "up") > quoteAtoms);
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
