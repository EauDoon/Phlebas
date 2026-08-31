import assert from "node:assert/strict";
import test from "node:test";

import { levelsFromBook, submitOrder } from "./matcher.ts";
import {
  applySubmit,
  applyUserFills,
  availableQuote,
  canCover,
  describeSubmit,
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

test("submit copy names a local book fill and no chain submission", () => {
  const result = submitOrder(seedBook("ZEC/USDC"), {
    id: "user-1",
    side: "buy",
    tif: "IOC",
    priceTicks: 5291n,
    sizeAtoms: 10_00000000n,
  });
  const copy = describeSubmit(result, "ZEC/USDC");
  assert.match(copy, /Filled against the local ZEC\/USDC book/);
  assert.match(copy, /Nothing was signed or submitted to a chain/);
  assert.doesNotMatch(copy, /\blive\b/i);
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
  assert.equal(applied.account.quoteAtoms, account.quoteAtoms - quoteAtomsForFill(10_00000000n, 5291n, "up"));
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
  assert.equal(applied.account.reservedQuoteAtoms, quoteAtomsForFill(2_00000000n, 5200n, "up"));
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

test("does not execute a one-base-atom fill below one quote atom at maker price", () => {
  const account = seedPaperAccount();
  const result = submitOrder(seedBook("ZEC/USDC"), {
    id: "user-price-improved",
    side: "buy",
    tif: "IOC",
    priceTicks: 10_000n,
    sizeAtoms: 1n,
  });
  const applied = applySubmit(account, {
    side: "buy",
    tif: "IOC",
    priceTicks: 10_000n,
    sizeAtoms: 1n,
  }, result);

  assert.equal(result.status, "cancelled");
  assert.equal(applied.blockedReason, undefined);
  assert.deepEqual(applied.account, account);
});

test("rounds a defensive one-base-atom buy settlement up to one quote atom", () => {
  const account = seedPaperAccount();
  const result = {
    book: seedBook("ZEC/USDC"),
    fills: [{ makerId: "venue-ask", takerSide: "buy" as const, priceTicks: 5291n, sizeAtoms: 1n }],
    remainingAtoms: 0n,
    status: "filled" as const,
  };
  const applied = applySubmit(account, {
    side: "buy",
    tif: "IOC",
    priceTicks: 10_000n,
    sizeAtoms: 1n,
  }, result);

  assert.equal(applied.blockedReason, undefined);
  assert.equal(applied.account.pzecAtoms, account.pzecAtoms + 1n);
  assert.equal(applied.account.quoteAtoms, account.quoteAtoms - 1n);
});

test("aggregates mixed-price fragments before side-aware settlement", () => {
  const account = seedPaperAccount();
  const fills = [
    { makerId: "venue-a", takerSide: "buy" as const, priceTicks: 5291n, sizeAtoms: 1n },
    { makerId: "venue-b", takerSide: "buy" as const, priceTicks: 5297n, sizeAtoms: 1n },
  ];
  const bought = applyUserFills(account, "buy", fills);
  assert.equal(bought.pzecAtoms, account.pzecAtoms + 2n);
  assert.equal(bought.quoteAtoms, account.quoteAtoms - 2n);

  const sold = applyUserFills(account, "sell", fills);
  assert.equal(sold.pzecAtoms, account.pzecAtoms - 2n);
  assert.equal(sold.quoteAtoms, account.quoteAtoms + 1n);
});

test("blocks a zero-quote sell settlement without mutating inventory", () => {
  const account = seedPaperAccount();
  const result = {
    book: seedBook("ZEC/USDC"),
    fills: [{ makerId: "venue-bid", takerSide: "sell" as const, priceTicks: 5291n, sizeAtoms: 1n }],
    remainingAtoms: 0n,
    status: "filled" as const,
  };
  const applied = applySubmit(account, {
    side: "sell",
    tif: "IOC",
    priceTicks: 10_000n,
    sizeAtoms: 1n,
  }, result);

  assert.match(applied.blockedReason ?? "", /at least one quote atom/);
  assert.deepEqual(applied.account, account);
});

test("checks exact fill debit plus rounded remainder reservation", () => {
  const account = {
    pzecAtoms: 0n,
    quoteAtoms: 2n,
    reservedPzecAtoms: 0n,
    reservedQuoteAtoms: 0n,
  };
  const result = {
    book: seedBook("ZEC/USDC"),
    fills: [{ makerId: "venue-ask", takerSide: "buy" as const, priceTicks: 5291n, sizeAtoms: 1n }],
    remainingAtoms: 2n,
    status: "open" as const,
  };
  const applied = applySubmit(account, {
    side: "buy",
    tif: "GTC",
    priceTicks: 5291n,
    sizeAtoms: 3n,
  }, result);

  assert.equal(canCover(account, "buy", 3n, 5291n), true);
  assert.equal(applied.blockedReason, "Session quote inventory is insufficient.");
  assert.deepEqual(applied.account, account);
  assert.equal(availableQuote(applied.account), 2n);
});
