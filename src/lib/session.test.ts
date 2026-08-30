import assert from "node:assert/strict";
import test from "node:test";

import { levelsFromBook, submitOrder } from "./matcher.ts";
import {
  applySubmit,
  availableQuote,
  canCover,
  releaseRestingOrder,
  seedBook,
  seedPaperAccount,
  userOrders,
  wouldSelfTrade,
} from "./session.ts";
import { quoteAtomsForFill } from "./units.ts";

test("seeds the USDC book from fixture levels with integer ticks", () => {
  const book = seedBook("ZEC/USDC");
  const bids = levelsFromBook(book, "buy");
  const asks = levelsFromBook(book, "sell");
  assert.equal(asks[0]?.priceTicks, 5291n);
  assert.equal(bids[0]?.priceTicks, 5278n);
  assert.equal(book.lastTicks, 5284n);
});

test("blocks a buy that exceeds session quote inventory", () => {
  const account = seedPaperAccount();
  assert.equal(canCover(account, "buy", 1_000_00000000n, 5291n), false);
  assert.equal(canCover(account, "sell", 10_00000000n, 5278n), true);
});

test("credits pZEC and debits quote on a buy fill", () => {
  const book = seedBook("ZEC/USDC");
  const account = seedPaperAccount();
  const result = submitOrder(book, {
    id: "user-1",
    side: "buy",
    tif: "IOC",
    priceTicks: 5291n,
    sizeAtoms: 10_00000000n,
  });
  const applied = applySubmit(account, { side: "buy", sizeAtoms: 10_00000000n, priceTicks: 5291n, tif: "IOC" }, result);
  assert.equal(result.status, "filled");
  assert.equal(applied.account.pzecAtoms, account.pzecAtoms + 10_00000000n);
  assert.equal(applied.account.quoteAtoms, account.quoteAtoms - quoteAtomsForFill(10_00000000n, 5291n));
  assert.equal(applied.account.reservedQuoteAtoms, 0n);
});

test("reserves leftover GTC size and releases it on cancel", () => {
  const book = seedBook("ZEC/USDC");
  const account = seedPaperAccount();
  const result = submitOrder(book, {
    id: "user-rest",
    side: "buy",
    tif: "GTC",
    priceTicks: 5200n,
    sizeAtoms: 2_00000000n,
  });
  const applied = applySubmit(account, { side: "buy", sizeAtoms: 2_00000000n, priceTicks: 5200n, tif: "GTC" }, result);
  assert.equal(result.status, "open");
  assert.equal(applied.account.reservedQuoteAtoms, quoteAtomsForFill(2_00000000n, 5200n));
  assert.ok(availableQuote(applied.account) < availableQuote(account));

  const resting = userOrders(result.book)[0];
  assert.ok(resting);
  const released = releaseRestingOrder(applied.account, resting);
  assert.equal(released.reservedQuoteAtoms, 0n);
});

test("flags a taker that would match a user maker", () => {
  assert.equal(wouldSelfTrade([{ makerId: "user-1", takerSide: "sell", priceTicks: 1n, sizeAtoms: 1n }]), true);
  assert.equal(wouldSelfTrade([{ makerId: "venue-ask-0", takerSide: "buy", priceTicks: 1n, sizeAtoms: 1n }]), false);
});
