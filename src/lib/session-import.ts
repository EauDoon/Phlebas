// Session import. The session import parses a JSON snapshot
// string produced by `src/lib/session-export.ts` and returns
// either the parsed snapshot or a structured rejection. The
// import is a pure function over a string. The import never
// reaches out to the network and never signs a transaction.

import type { Book } from "./matcher.ts";
import type { MarketId } from "./market-data.ts";
import type { PaperAccount, UserFill } from "./session.ts";
import type { SessionLogEvent } from "./replay.ts";
import type { SessionSnapshot } from "./session-export.ts";

export type SessionImportError =
  | { kind: "invalid-json"; reason: string }
  | { kind: "schema-mismatch"; reason: string }
  | { kind: "shape-invalid"; reason: string };

export type SessionImportResult =
  | { ok: true; snapshot: SessionSnapshot }
  | { ok: false; error: SessionImportError };

const SUPPORTED_SCHEMA = "phlebas-session-snapshot" as const;
const SUPPORTED_VERSION = 1 as const;

export function parseSessionSnapshot(text: string): SessionImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    return { ok: false, error: { kind: "invalid-json", reason: describeError(error) } };
  }
  if (!isRecord(parsed)) {
    return { ok: false, error: { kind: "shape-invalid", reason: "snapshot is not an object" } };
  }
  if (parsed.schema !== SUPPORTED_SCHEMA) {
    return { ok: false, error: { kind: "schema-mismatch", reason: `unexpected schema tag ${stringify(parsed.schema)}` } };
  }
  if (parsed.schemaVersion !== SUPPORTED_VERSION) {
    return { ok: false, error: { kind: "schema-mismatch", reason: `unsupported schema version ${stringify(parsed.schemaVersion)}` } };
  }
  const shapeError = validateShape(parsed);
  if (shapeError) {
    return { ok: false, error: { kind: "shape-invalid", reason: shapeError } };
  }
  return { ok: true, snapshot: parsed as unknown as SessionSnapshot };
}

function validateShape(value: Record<string, unknown>): string | null {
  for (const key of ["market", "settlementPair", "account", "book", "fills", "sessionLog"] as const) {
    if (!(key in value)) return `missing field ${key}`;
  }
  if (value.market !== "ZEC/USDC" && value.market !== "ZEC/USDT") {
    return `unsupported market ${stringify(value.market)}`;
  }
  if (typeof value.exportedAt !== "string") return "exportedAt is not a string";
  if (!isRecord(value.account)) return "account is not an object";
  if (!isRecord(value.book)) return "book is not an object";
  if (!Array.isArray(value.fills)) return "fills is not an array";
  if (!Array.isArray(value.sessionLog)) return "sessionLog is not an array";
  return null;
}

export function describeImportError(error: SessionImportError): string {
  if (error.kind === "invalid-json") return `Invalid JSON: ${error.reason}`;
  if (error.kind === "schema-mismatch") return `Schema mismatch: ${error.reason}`;
  return `Shape invalid: ${error.reason}`;
}

export function applyImportedSnapshot(snapshot: SessionSnapshot): {
  market: MarketId;
  account: PaperAccount;
  book: Book;
  fills: readonly UserFill[];
  sessionLog: readonly SessionLogEvent[];
} {
  // The apply function is a thin adapter. The lib is pure; the
  // trading terminal is the only place that owns the React
  // state. The apply function returns the four pieces the
  // trading terminal needs to seed its state.
  return {
    market: snapshot.market,
    account: snapshot.account,
    book: snapshot.book,
    fills: snapshot.fills,
    sessionLog: snapshot.sessionLog,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringify(value: unknown): string {
  if (typeof value === "string") return JSON.stringify(value);
  return String(value);
}

function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return "unknown JSON parse error";
}
