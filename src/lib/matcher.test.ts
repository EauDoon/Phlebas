import assert from "node:assert/strict";
import test from "node:test";

import { cancelOrder, emptyBook, levelsFromBook, submitOrder } from "./matcher.ts";

function seed() {
  let book = emptyBook(5284n);
  book = submitOrder(book, { id: "ask-1", side: "sell", tif: "GTC", priceTicks: 5291n, sizeAtoms: 10_00000000n }).book;
  book = submitOrder(book, { id: "ask-2", side: "sell", tif: "GTC", priceTicks: 5297n, sizeAtoms: 5_00000000n }).book;
  book = submitOrder(book, { id: "bid-1", side: "buy", tif: "GTC", priceTicks: 5278n, sizeAtoms: 8_00000000n }).book;
  return book;
}

test("price-time priority fills the earlier order at the same price first", () => {
  let book = emptyBook(5284n);
  book = submitOrder(book, { id: "old", side: "sell", tif: "GTC", priceTicks: 5291n, sizeAtoms: 1_00000000n }).book;
  book = submitOrder(book, { id: "new", side: "sell", tif: "GTC", priceTicks: 5291n, sizeAtoms: 1_00000000n }).book;
  const result = submitOrder(book, { id: "taker", side: "buy", tif: "IOC", priceTicks: 5291n, sizeAtoms: 1_00000000n });
  assert.equal(result.fills.length, 1);
  assert.equal(result.fills[0]?.makerId, "old");
  assert.equal(result.status, "filled");
});

test("GTC rests unfilled size on the book", () => {
  const book = seed();
  const result = submitOrder(book, { id: "taker", side: "buy", tif: "GTC", priceTicks: 5291n, sizeAtoms: 12_00000000n });
  assert.equal(result.status, "open");
  assert.equal(result.remainingAtoms, 2_00000000n);
  assert.equal(result.fills[0]?.sizeAtoms, 10_00000000n);
  const bids = levelsFromBook(result.book, "buy");
  assert.equal(bids[0]?.priceTicks, 5291n);
  assert.equal(bids[0]?.sizeAtoms, 2_00000000n);
});

test("IOC cancels the unfilled remainder", () => {
  const result = submitOrder(seed(), { id: "taker", side: "buy", tif: "IOC", priceTicks: 5291n, sizeAtoms: 12_00000000n });
  assert.equal(result.status, "cancelled");
  assert.equal(result.remainingAtoms, 2_00000000n);
  assert.equal(levelsFromBook(result.book, "buy").some((level) => level.priceTicks === 5291n), false);
});

test("FOK rejects when the full size cannot fill", () => {
  const book = seed();
  const result = submitOrder(book, { id: "taker", side: "buy", tif: "FOK", priceTicks: 5291n, sizeAtoms: 12_00000000n });
  assert.equal(result.status, "rejected");
  assert.equal(result.fills.length, 0);
  assert.equal(book.asks.length, seed().asks.length);
});

test("a buy never fills above its limit", () => {
  const result = submitOrder(seed(), { id: "taker", side: "buy", tif: "IOC", priceTicks: 5280n, sizeAtoms: 1_00000000n });
  assert.equal(result.fills.length, 0);
  assert.equal(result.status, "cancelled");
});

test("cancel removes only the named resting order", () => {
  const book = cancelOrder(seed(), "ask-1");
  assert.equal(book.asks.some((order) => order.id === "ask-1"), false);
  assert.equal(book.asks.some((order) => order.id === "ask-2"), true);
});

test("FOK fills in full when size is available", () => {
  const result = submitOrder(seed(), { id: "taker", side: "buy", tif: "FOK", priceTicks: 5291n, sizeAtoms: 10_00000000n });
  assert.equal(result.status, "filled");
  assert.equal(result.fills[0]?.sizeAtoms, 10_00000000n);
});

test("cancel of an unknown id leaves the book unchanged", () => {
  const book = seed();
  const next = cancelOrder(book, "missing");
  assert.equal(next.asks.length, book.asks.length);
  assert.equal(next.bids.length, book.bids.length);
});

test("rejects non-positive size or price", () => {
  const book = emptyBook(5284n);
  assert.equal(submitOrder(book, { id: "x", side: "buy", tif: "GTC", priceTicks: 0n, sizeAtoms: 1n }).status, "rejected");
  assert.equal(submitOrder(book, { id: "x", side: "buy", tif: "GTC", priceTicks: 1n, sizeAtoms: 0n }).status, "rejected");
});

test("rejects an order below one quote atom at the matcher boundary", () => {
  const book = emptyBook(5284n);
  const result = submitOrder(book, {
    id: "dust",
    side: "buy",
    tif: "GTC",
    priceTicks: 5291n,
    sizeAtoms: 1n,
  });
  assert.equal(result.status, "rejected");
  assert.match(result.reason ?? "", /at least one quote atom/);
  assert.equal(result.book, book);
});

test("never leaves an unsettleable maker remainder", () => {
  let book = emptyBook(5284n);
  book = submitOrder(book, {
    id: "maker",
    side: "sell",
    tif: "GTC",
    priceTicks: 5291n,
    sizeAtoms: 4n,
  }).book;

  const result = submitOrder(book, {
    id: "taker",
    side: "buy",
    tif: "GTC",
    priceTicks: 5291n,
    sizeAtoms: 3n,
  });
  assert.equal(result.status, "cancelled");
  assert.equal(result.fills[0]?.sizeAtoms, 2n);
  assert.equal(result.remainingAtoms, 1n);
  assert.equal(result.book.asks[0]?.remainingAtoms, 2n);
  assert.match(result.reason ?? "", /remainder was cancelled/);
});

test("FOK rejects atomically when dust rules prevent a full fill", () => {
  let book = emptyBook(5284n);
  book = submitOrder(book, {
    id: "maker",
    side: "sell",
    tif: "GTC",
    priceTicks: 5291n,
    sizeAtoms: 4n,
  }).book;
  const result = submitOrder(book, {
    id: "taker",
    side: "buy",
    tif: "FOK",
    priceTicks: 5291n,
    sizeAtoms: 3n,
  });
  assert.equal(result.status, "rejected");
  assert.equal(result.fills.length, 0);
  assert.equal(result.book, book);
  assert.equal(book.asks[0]?.remainingAtoms, 4n);
});

test("cancels a dust-blocked GTC remainder instead of crossing the book", () => {
  let book = emptyBook(5284n);
  book = submitOrder(book, {
    id: "maker",
    side: "sell",
    tif: "GTC",
    priceTicks: 5291n,
    sizeAtoms: 3n,
  }).book;
  const result = submitOrder(book, {
    id: "taker",
    side: "buy",
    tif: "GTC",
    priceTicks: 10_000n,
    sizeAtoms: 2n,
  });

  assert.equal(result.status, "cancelled");
  assert.equal(result.fills.length, 0);
  assert.equal(result.remainingAtoms, 2n);
  assert.equal(result.book.bids.length, 0);
  assert.equal(result.book.asks[0]?.remainingAtoms, 3n);
  assert.match(result.reason ?? "", /Dust-blocked crossed remainder/);
});
