import assert from "node:assert/strict";
import test from "node:test";

import { describeSessionLogEvent, replayLog, snapshotKey, type SessionLogEvent } from "./replay.ts";
import { availableQuote, SESSION_QUOTE_ATOMS, SESSION_ZEC_ATOMS } from "./session.ts";

test("replaying the same submit and cancel log yields the same book and balances", () => {
  const events: SessionLogEvent[] = [
    {
      kind: "submit",
      marketId: "ZEC/USDC",
      id: "user-1",
      side: "buy",
      tif: "IOC",
      priceTicks: 5291n,
      sizeAtoms: 1_00000000n,
      expiryUnix: 1700000000n,
    },
    {
      kind: "submit",
      marketId: "ZEC/USDC",
      id: "user-2",
      side: "buy",
      tif: "GTC",
      priceTicks: 5200n,
      sizeAtoms: 2_00000000n,
      expiryUnix: 1700000000n,
    },
    { kind: "cancel", marketId: "ZEC/USDC", orderId: "user-2" },
  ];

  const first = replayLog(events);
  const second = replayLog(events);
  assert.equal(snapshotKey(first), snapshotKey(second));
  assert.equal(first.accounts["ZEC/USDC"].zecAtoms, SESSION_ZEC_ATOMS + 1_00000000n);
  assert.equal(first.accounts["ZEC/USDC"].reservedQuoteAtoms, 0n);
  assert.equal(events[0]?.kind === "submit" ? events[0].expiryUnix : 0n, 1700000000n);
});

test("reset returns the session to the fixture snapshot", () => {
  const seeded = replayLog([]);
  const after = replayLog([
    {
      kind: "submit",
      marketId: "ZEC/USDC",
      id: "user-1",
      side: "buy",
      tif: "IOC",
      priceTicks: 5291n,
      sizeAtoms: 1_00000000n,
      expiryUnix: 1700000000n,
    },
    { kind: "reset" },
  ]);
  assert.equal(snapshotKey(after), snapshotKey(seeded));
});

test("replay preserves expiry metadata on resting orders", () => {
  const state = replayLog([{
    kind: "submit",
    marketId: "ZEC/USDC",
    id: "user-expiring",
    side: "buy",
    tif: "GTC",
    priceTicks: 5200n,
    sizeAtoms: 1_00000000n,
    expiryUnix: 1700000000n,
  }]);

  assert.equal(
    state.books["ZEC/USDC"].bids.find((order) => order.id === "user-expiring")?.expiryUnix,
    1700000000n,
  );
});

test("cancelling a venue fixture order id does not manufacture available quote", () => {
  // seedBook posts fixture liquidity under ids like "venue-bid-ZEC/USDC-0"
  // (see session.ts seedBook). Those orders never run through
  // applySubmit/reserveRemainder, so they hold no PaperAccount reservation.
  // A cancel event naming one must be a no-op on the account: releasing a
  // reservation that was never taken would drive reservedQuoteAtoms
  // negative and hand the account quote it never had.
  const state = replayLog([
    { kind: "cancel", marketId: "ZEC/USDC", orderId: "venue-bid-ZEC/USDC-0" },
  ]);
  const account = state.accounts["ZEC/USDC"];
  assert.equal(account.reservedQuoteAtoms, 0n);
  assert.equal(account.reservedZecAtoms, 0n);
  assert.equal(account.quoteAtoms, SESSION_QUOTE_ATOMS);
  assert.equal(availableQuote(account), SESSION_QUOTE_ATOMS);
  // The venue order itself is untouched: it was never a user order to begin with.
  assert.equal(
    state.books["ZEC/USDC"].bids.some((order) => order.id === "venue-bid-ZEC/USDC-0"),
    true,
  );
});

test("session log lines include expiry when a ticket is confirmed", () => {
  assert.equal(
    describeSessionLogEvent({
      kind: "submit",
      marketId: "ZEC/USDC",
      id: "user-1",
      side: "buy",
      tif: "GTC",
      priceTicks: 5200n,
      sizeAtoms: 1_00000000n,
      expiryUnix: 0n,
    }),
    "buy GTC user-1 expiry none",
  );
  assert.equal(
    describeSessionLogEvent({
      kind: "submit",
      marketId: "ZEC/USDC",
      id: "user-2",
      side: "sell",
      tif: "IOC",
      priceTicks: 5291n,
      sizeAtoms: 1_00000000n,
      expiryUnix: 1700000000n,
    }),
    "sell IOC user-2 expiry 1700000000",
  );
});
