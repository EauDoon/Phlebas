import assert from "node:assert/strict";
import test from "node:test";

import type { Market } from "./market-data.ts";
import {
  buildSessionSnapshot,
  describeSessionSnapshot,
  serializeSessionSnapshot,
} from "./session-export.ts";
import { seedBook, seedPaperAccount, type UserFill } from "./session.ts";
import type { SessionLogEvent } from "./replay.ts";

const ZEC_USDC: Market = {
  id: "ZEC/USDC",
  settlementPair: "ZEC-USDC",
  quote: "USDC",
  lastTicks: 0n,
  changeBps: 0,
  highTicks: 0n,
  lowTicks: 0n,
  volume: "0",
};

test("buildSessionSnapshot returns a typed snapshot with the schema tag and a default exportedAt", () => {
  const account = seedPaperAccount();
  const book = seedBook("ZEC/USDC");
  const snapshot = buildSessionSnapshot({
    market: ZEC_USDC,
    account,
    book,
    fills: [],
    sessionLog: [],
  });
  assert.equal(snapshot.schema, "phlebas-session-snapshot");
  assert.equal(snapshot.schemaVersion, 1);
  assert.equal(snapshot.market, "ZEC/USDC");
  assert.equal(snapshot.settlementPair, "ZEC-USDC");
  assert.equal(snapshot.account, account);
  assert.equal(snapshot.book, book);
  assert.ok(snapshot.exportedAt.length > 0);
});

test("buildSessionSnapshot accepts an explicit exportedAt timestamp", () => {
  const account = seedPaperAccount();
  const book = seedBook("ZEC/USDC");
  const snapshot = buildSessionSnapshot({
    market: ZEC_USDC,
    account,
    book,
    fills: [],
    sessionLog: [],
    exportedAt: "2026-09-01T00:00:00.000Z",
  });
  assert.equal(snapshot.exportedAt, "2026-09-01T00:00:00.000Z");
});

test("serializeSessionSnapshot is deterministic for the same input", () => {
  const account = seedPaperAccount();
  const book = seedBook("ZEC/USDC");
  const fills: UserFill[] = [
    {
      id: "fill-1",
      makerId: "user-m1",
      takerId: "matcher",
      takerSide: "buy",
      priceTicks: 5000000n,
      sizeAtoms: 100000000n,
      marketId: "ZEC/USDC",
      time: "12:00:00",
    },
  ];
  const log: SessionLogEvent[] = [
    { kind: "submit", marketId: "ZEC/USDC", id: "user-1", side: "buy", tif: "GTC", priceTicks: 5000000n, sizeAtoms: 100000000n, expiryUnix: 0n },
  ];
  const a = buildSessionSnapshot({ market: ZEC_USDC, account, book, fills, sessionLog: log, exportedAt: "2026-09-01T00:00:00.000Z" });
  const b = buildSessionSnapshot({ market: ZEC_USDC, account, book, fills, sessionLog: log, exportedAt: "2026-09-01T00:00:00.000Z" });
  assert.equal(serializeSessionSnapshot(a), serializeSessionSnapshot(b));
});

test("serializeSessionSnapshot round-trips through JSON.parse", () => {
  const account = seedPaperAccount();
  const book = seedBook("ZEC/USDC");
  const snapshot = buildSessionSnapshot({
    market: ZEC_USDC,
    account,
    book,
    fills: [],
    sessionLog: [],
    exportedAt: "2026-09-01T00:00:00.000Z",
  });
  const json = serializeSessionSnapshot(snapshot);
  const parsed = JSON.parse(json) as { schema: string; market: string };
  assert.equal(parsed.schema, "phlebas-session-snapshot");
  assert.equal(parsed.market, "ZEC/USDC");
});

test("describeSessionSnapshot mentions the market, the fill count, and the exportedAt", () => {
  const account = seedPaperAccount();
  const book = seedBook("ZEC/USDC");
  const fills: UserFill[] = [
    {
      id: "fill-1",
      makerId: "user-m1",
      takerId: "matcher",
      takerSide: "buy",
      priceTicks: 5000000n,
      sizeAtoms: 100000000n,
      marketId: "ZEC/USDC",
      time: "12:00:00",
    },
    {
      id: "fill-2",
      makerId: "matcher",
      takerId: "user-m2",
      takerSide: "sell",
      priceTicks: 5000000n,
      sizeAtoms: 50000000n,
      marketId: "ZEC/USDC",
      time: "12:00:01",
    },
  ];
  const log: SessionLogEvent[] = [
    { kind: "submit", marketId: "ZEC/USDC", id: "user-1", side: "buy", tif: "GTC", priceTicks: 5000000n, sizeAtoms: 100000000n, expiryUnix: 0n },
    { kind: "cancel", marketId: "ZEC/USDC", orderId: "user-1" },
    { kind: "reset" },
  ];
  const snapshot = buildSessionSnapshot({
    market: ZEC_USDC,
    account,
    book,
    fills,
    sessionLog: log,
    exportedAt: "2026-09-01T00:00:00.000Z",
  });
  const description = describeSessionSnapshot(snapshot);
  assert.match(description, /ZEC\/USDC/);
  assert.match(description, /2 fills/);
  assert.match(description, /3 log events/);
  assert.match(description, /2026-09-01/);
});
