// Session export. The session export builds a deterministic
// JSON snapshot of the in-browser session state for a given
// market. The snapshot is what the user can copy to the
// clipboard from the trade blotter to share a reproducible
// record of a session, file a bug report, or compare two
// runs against the same seed.
//
// The export never includes a wallet address, a private key,
// a spending key, a viewing key, or a transaction. The
// export never reaches out to the network. The export is a
// pure function over a state record.

import type { Book } from "./matcher.ts";
import type { Market } from "./market-data.ts";
import type { PaperAccount, UserFill } from "./session.ts";
import type { SessionLogEvent } from "./replay.ts";

export type SessionSnapshot = Readonly<{
  schema: "phlebas-session-snapshot";
  schemaVersion: 1;
  exportedAt: string;
  market: Market["id"];
  settlementPair: Market["settlementPair"];
  account: PaperAccount;
  book: Book;
  fills: readonly UserFill[];
  sessionLog: readonly SessionLogEvent[];
}>;

export function buildSessionSnapshot(input: {
  market: Market;
  account: PaperAccount;
  book: Book;
  fills: readonly UserFill[];
  sessionLog: readonly SessionLogEvent[];
  exportedAt?: string;
}): SessionSnapshot {
  return {
    schema: "phlebas-session-snapshot",
    schemaVersion: 1,
    exportedAt: input.exportedAt ?? new Date().toISOString(),
    market: input.market.id,
    settlementPair: input.market.settlementPair,
    account: input.account,
    book: input.book,
    fills: input.fills,
    sessionLog: input.sessionLog,
  };
}

export function serializeSessionSnapshot(snapshot: SessionSnapshot): string {
  // The serializer is deterministic for the same snapshot and
  // round-trippable: the canonical keys are emitted in a fixed
  // order so two snapshots with the same state produce the
  // same bytes. Numeric atoms are emitted as decimal strings
  // because the JSON representation of a BigInt is otherwise
  // platform-specific.
  const ordered: Record<string, unknown> = {
    schema: snapshot.schema,
    schemaVersion: snapshot.schemaVersion,
    exportedAt: snapshot.exportedAt,
    market: snapshot.market,
    settlementPair: snapshot.settlementPair,
    account: snapshot.account,
    book: snapshot.book,
    fills: snapshot.fills,
    sessionLog: snapshot.sessionLog,
  };
  return JSON.stringify(ordered, bigIntReplacer, 2);
}

function bigIntReplacer(_key: string, value: unknown): unknown {
  return typeof value === "bigint" ? value.toString() : value;
}

export function describeSessionSnapshot(snapshot: SessionSnapshot): string {
  const fillsCount = snapshot.fills.length;
  const logCount = snapshot.sessionLog.length;
  const restingCount = snapshot.book.bids.length + snapshot.book.asks.length;
  return `Phlebas session snapshot — ${snapshot.market} (${snapshot.settlementPair}); ${fillsCount} fills, ${logCount} log events, ${restingCount} resting orders; exported at ${snapshot.exportedAt}`;
}
