import assert from "node:assert/strict";
import test from "node:test";

import { emptyBook, submitOrder } from "./matcher.ts";
import { pools } from "./market-data.ts";
import { compareVenues, quoteClob, quoteSplitRoute } from "./router.ts";
import { seedBook } from "./session.ts";

const usdcPool = {
  reserveZecAtoms: pools[0].reserveZecAtoms,
  reserveQuoteAtoms: pools[0].reserveQuoteAtoms,
};

test("CLOB preview does not mutate the seeded book", () => {
  const book = seedBook("ZEC/USDC");
  const before = book.asks.length;
  const quote = quoteClob(book, "buy", 1_00000000n, 5291n);
  assert.equal(quote.complete, true);
  assert.equal(quote.quoteAtoms, 52_910000n);
  assert.equal(book.asks.length, before);
});

test("CLOB preview fails closed when the route would cross a blocked maker", () => {
  let book = emptyBook(5284n);
  book = submitOrder(book, {
    id: "user-1",
    side: "sell",
    tif: "GTC",
    priceTicks: 5291n,
    sizeAtoms: 1_00000000n,
  }).book;
  const quote = quoteClob(book, "buy", 1_00000000n, 5291n, "user-");
  assert.equal(quote.complete, false);
  assert.equal(quote.filledAtoms, 0n);
  assert.equal(quote.quoteAtoms, 0n);
  assert.equal(quote.blockedByMaker, true);
});

test("buy comparison prefers the cheaper complete venue", () => {
  const book = seedBook("ZEC/USDC");
  const comparison = compareVenues({
    book,
    side: "buy",
    sizeAtoms: 1_00000000n,
    limitTicks: 5310n,
    ...usdcPool,
  });
  assert.equal(comparison.clob.complete, true);
  assert.equal(comparison.amm.complete, true);
  assert.notEqual(comparison.better, "none");
});

test("split uses CLOB while it is cheaper, then the AMM remainder", () => {
  let book = emptyBook(5284n);
  book = submitOrder(book, {
    id: "cheap-ask",
    side: "sell",
    tif: "GTC",
    priceTicks: 100n,
    sizeAtoms: 1_00000000n,
  }).book;

  const split = quoteSplitRoute({
    book,
    side: "buy",
    sizeAtoms: 3_00000000n,
    limitTicks: 10_000n,
    reserveZecAtoms: 10_000_00000000n,
    reserveQuoteAtoms: 500_000_000000n,
  });

  assert.equal(split.clobFilledAtoms, 1_00000000n);
  assert.equal(split.ammFilledAtoms, 2_00000000n);
  assert.equal(split.complete, true);
  assert.ok(split.clobQuoteAtoms < split.ammQuoteAtoms);

  const comparison = compareVenues({
    book,
    side: "buy",
    sizeAtoms: 3_00000000n,
    limitTicks: 10_000n,
    reserveZecAtoms: 10_000_00000000n,
    reserveQuoteAtoms: 500_000_000000n,
  });
  assert.equal(comparison.better, "split");
  assert.ok(comparison.split.quoteAtoms < comparison.amm.quoteAtoms);
  assert.equal(book.asks.length, 1);
});

test("split preview does not mutate the book", () => {
  const book = seedBook("ZEC/USDC");
  const asks = book.asks.map((order) => order.remainingAtoms);
  quoteSplitRoute({
    book,
    side: "buy",
    sizeAtoms: 20_00000000n,
    limitTicks: 5400n,
    ...usdcPool,
  });
  assert.deepEqual(book.asks.map((order) => order.remainingAtoms), asks);
});

test("split stays inside the signed worst price", () => {
  const book = seedBook("ZEC/USDC");
  const split = quoteSplitRoute({
    book,
    side: "buy",
    sizeAtoms: 1_00000000n,
    limitTicks: 5200n,
    ...usdcPool,
  });
  assert.equal(split.clobFilledAtoms, 0n);
  assert.equal(split.complete, false);
});

test("CLOB preview aggregates fragments before side-aware rounding", () => {
  let asks = emptyBook(5284n);
  asks = submitOrder(asks, {
    id: "ask-a",
    side: "sell",
    tif: "GTC",
    priceTicks: 5291n,
    sizeAtoms: 2n,
  }).book;
  asks = submitOrder(asks, {
    id: "ask-b",
    side: "sell",
    tif: "GTC",
    priceTicks: 5297n,
    sizeAtoms: 2n,
  }).book;
  assert.equal(quoteClob(asks, "buy", 4n, 5297n).quoteAtoms, 3n);

  let bids = emptyBook(5284n);
  bids = submitOrder(bids, {
    id: "bid-a",
    side: "buy",
    tif: "GTC",
    priceTicks: 5297n,
    sizeAtoms: 2n,
  }).book;
  bids = submitOrder(bids, {
    id: "bid-b",
    side: "buy",
    tif: "GTC",
    priceTicks: 5291n,
    sizeAtoms: 2n,
  }).book;
  assert.equal(quoteClob(bids, "sell", 4n, 5291n).quoteAtoms, 2n);
});

test("split preview aggregates CLOB fragments with buy-side rounding", () => {
  let book = emptyBook(5284n);
  book = submitOrder(book, {
    id: "ask-a",
    side: "sell",
    tif: "GTC",
    priceTicks: 5291n,
    sizeAtoms: 2n,
  }).book;
  book = submitOrder(book, {
    id: "ask-b",
    side: "sell",
    tif: "GTC",
    priceTicks: 5297n,
    sizeAtoms: 2n,
  }).book;

  const split = quoteSplitRoute({
    book,
    side: "buy",
    sizeAtoms: 4n,
    limitTicks: 10_000n,
    reserveZecAtoms: 100n,
    reserveQuoteAtoms: 10_000n,
  });
  assert.equal(split.clobFilledAtoms, 4n);
  assert.equal(split.clobQuoteAtoms, 3n);
});

test("split preview follows matcher dust blocking", () => {
  let book = emptyBook(5284n);
  book = submitOrder(book, {
    id: "dust-ask",
    side: "sell",
    tif: "GTC",
    priceTicks: 5291n,
    sizeAtoms: 3n,
  }).book;

  const split = quoteSplitRoute({
    book,
    side: "buy",
    sizeAtoms: 2n,
    limitTicks: 10_000n,
    reserveZecAtoms: 100n,
    reserveQuoteAtoms: 10_000n,
  });
  assert.equal(split.clobFilledAtoms, 0n);
});

test("venue comparison returns none when every route is incomplete", () => {
  let book = emptyBook(5284n);
  book = submitOrder(book, {
    id: "partial-ask",
    side: "sell",
    tif: "GTC",
    priceTicks: 100n,
    sizeAtoms: 100n,
  }).book;

  const comparison = compareVenues({
    book,
    side: "buy",
    sizeAtoms: 300n,
    limitTicks: 10_000n,
    reserveZecAtoms: 100_000n,
    reserveQuoteAtoms: 1_000_000_000n,
  });
  assert.equal(comparison.clob.complete, false);
  assert.equal(comparison.amm.complete, false);
  assert.equal(comparison.split.complete, false);
  assert.equal(comparison.better, "none");
});
