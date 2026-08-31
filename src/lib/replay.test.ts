import assert from "node:assert/strict";
import test from "node:test";

import { replayLog, snapshotKey, type SessionLogEvent } from "./replay.ts";
import { SESSION_ZEC_ATOMS } from "./session.ts";

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
    },
    { kind: "reset" },
  ]);
  assert.equal(snapshotKey(after), snapshotKey(seeded));
});
