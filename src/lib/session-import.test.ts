import assert from "node:assert/strict";
import test from "node:test";

import type { Market } from "./market-data.ts";
import {
  applyImportedSnapshot,
  describeImportError,
  parseSessionSnapshot,
} from "./session-import.ts";
import { buildSessionSnapshot } from "./session-export.ts";
import { seedBook, seedPaperAccount, type UserFill } from "./session.ts";
import type { SessionLogEvent } from "./replay.ts";

function stringifyWithBigInt(value: unknown): string {
  return JSON.stringify(value, (_key, v) => (typeof v === "bigint" ? v.toString() : v));
}

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

function makeSnapshot(exportedAt = "2026-09-01T00:00:00.000Z") {
  const account = seedPaperAccount();
  const book = seedBook("ZEC/USDC");
  return buildSessionSnapshot({
    market: ZEC_USDC,
    account,
    book,
    fills: [],
    sessionLog: [],
    exportedAt,
  });
}

test("parseSessionSnapshot round-trips a snapshot produced by buildSessionSnapshot", () => {
  const snapshot = makeSnapshot();
  const json = JSON.stringify(snapshot, (_key, value) => (typeof value === "bigint" ? value.toString() : value));
  const result = parseSessionSnapshot(json);
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.snapshot.schema, "phlebas-session-snapshot");
    assert.equal(result.snapshot.schemaVersion, 1);
    assert.equal(result.snapshot.market, "ZEC/USDC");
  }
});

test("parseSessionSnapshot rejects invalid JSON with an invalid-json error", () => {
  const result = parseSessionSnapshot("not a json");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "invalid-json");
  }
});

test("parseSessionSnapshot rejects an empty string with an invalid-json error", () => {
  const result = parseSessionSnapshot("");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "invalid-json");
  }
});

test("parseSessionSnapshot rejects a snapshot with a wrong schema tag", () => {
  const snapshot = makeSnapshot();
  const json = stringifyWithBigInt({ ...snapshot, schema: "not-phlebas" });
  const result = parseSessionSnapshot(json);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "schema-mismatch");
  }
});

test("parseSessionSnapshot rejects a snapshot with an unsupported version", () => {
  const snapshot = makeSnapshot();
  const json = stringifyWithBigInt({ ...snapshot, schemaVersion: 99 });
  const result = parseSessionSnapshot(json);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "schema-mismatch");
  }
});

test("parseSessionSnapshot rejects a snapshot that is missing the account", () => {
  const snapshot = makeSnapshot() as Record<string, unknown>;
  delete snapshot.account;
  const result = parseSessionSnapshot(stringifyWithBigInt(snapshot));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "shape-invalid");
  }
});

test("parseSessionSnapshot rejects a snapshot whose market is not ZEC/USDC or ZEC/USDT", () => {
  const snapshot = makeSnapshot() as Record<string, unknown>;
  snapshot.market = "BTC/USDT";
  const result = parseSessionSnapshot(stringifyWithBigInt(snapshot));
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.kind, "shape-invalid");
  }
});

test("describeImportError mentions the error kind", () => {
  assert.match(describeImportError({ kind: "invalid-json", reason: "bad" }), /Invalid JSON/);
  assert.match(describeImportError({ kind: "schema-mismatch", reason: "wrong" }), /Schema mismatch/);
  assert.match(describeImportError({ kind: "shape-invalid", reason: "missing" }), /Shape invalid/);
});

test("applyImportedSnapshot returns the four pieces the trading terminal needs", () => {
  const account = seedPaperAccount();
  const book = seedBook("ZEC/USDC");
  const fills: UserFill[] = [];
  const sessionLog: SessionLogEvent[] = [];
  const snapshot = buildSessionSnapshot({
    market: ZEC_USDC,
    account,
    book,
    fills,
    sessionLog,
    exportedAt: "2026-09-01T00:00:00.000Z",
  });
  const applied = applyImportedSnapshot(snapshot);
  assert.equal(applied.market, "ZEC/USDC");
  assert.equal(applied.account, account);
  assert.equal(applied.book, book);
  assert.equal(applied.fills, fills);
  assert.equal(applied.sessionLog, sessionLog);
});
