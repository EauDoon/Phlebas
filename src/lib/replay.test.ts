import assert from "node:assert/strict";
import test from "node:test";

import { describeSessionLogEvent, replayLog, snapshotKey, type SessionLogEvent } from "./replay.ts";
import { SESSION_PZEC_ATOMS } from "./session.ts";

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
      expiryUnix: 0n,
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
  assert.equal(first.accounts["ZEC/USDC"].pzecAtoms, SESSION_PZEC_ATOMS + 1_00000000n);
  assert.equal(first.accounts["ZEC/USDC"].reservedQuoteAtoms, 0n);
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
