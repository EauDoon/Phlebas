import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";

import { keccak256Text } from "../../src/lib/keccak.ts";
import { normalizeHex32, type Hex32 } from "../../src/lib/order-domain.ts";
import { atomicWriteFile } from "../durable-file.ts";

export const JOURNAL_VERSION = 1;
export const JOURNAL_GENESIS_HASH = `0x${"00".repeat(32)}` as Hex32;
export const DEFAULT_MAX_JOURNAL_RECORDS = 100_000;
export const DEFAULT_MAX_JOURNAL_LINE_BYTES = 256 * 1024;

export type JournalValue = null | boolean | number | string | JournalValue[] | { [key: string]: JournalValue };

export type JournalRecord = Readonly<{
  version: typeof JOURNAL_VERSION;
  sequence: string;
  previousRecordHash: Hex32;
  event: Readonly<Record<string, JournalValue>>;
  recordHash: Hex32;
}>;

export type JournalState = Readonly<{
  records: readonly JournalRecord[];
  sequence: bigint;
  head: Hex32;
}>;

export type JournalCheckpoint = Readonly<{
  version: typeof JOURNAL_VERSION;
  sequence: string;
  recordHash: Hex32;
  stateRoot: Hex32;
  configurationHash: Hex32;
}>;

const appendLocks = new Map<string, Promise<void>>();
const FORBIDDEN_KEYS = new Set(["__proto__", "constructor", "prototype"]);

function assertPlainObject(value: object): asserts value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError("Journal values must use plain JSON objects");
  }
}

function assertExactKeys(value: object, allowed: readonly string[], label: string): void {
  assertPlainObject(value);
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has missing or unsupported fields`);
  }
}

export function canonicalJournalJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value) || !Number.isSafeInteger(value)) {
      throw new TypeError("Journal numbers must be finite safe integers");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJournalJson).join(",")}]`;
  if (typeof value === "object") {
    assertPlainObject(value);
    return `{${Object.keys(value).sort().map((key) => {
      if (FORBIDDEN_KEYS.has(key)) throw new TypeError(`Journal key ${key} is forbidden`);
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) throw new TypeError("Journal values cannot be undefined");
      return `${JSON.stringify(key)}:${canonicalJournalJson(item)}`;
    }).join(",")}}`;
  }
  throw new TypeError("Journal values must be JSON-compatible");
}

function canonicalSequence(value: string, label: string, allowZero = false): bigint {
  if (!/^(?:0|[1-9][0-9]*)$/.test(value)) throw new TypeError(`${label} must be canonical decimal`);
  const parsed = BigInt(value);
  if (parsed < (allowZero ? 0n : 1n)) throw new RangeError(`${label} is outside its allowed range`);
  return parsed;
}

export function hashJournalRecord(
  sequence: bigint,
  previousRecordHash: Hex32,
  event: Readonly<Record<string, JournalValue>>,
): Hex32 {
  if (sequence <= 0n) throw new RangeError("Journal sequence must be positive");
  return keccak256Text([
    "PhlebasMatcherJournal",
    `version=${JOURNAL_VERSION}`,
    `sequence=${sequence}`,
    `previousRecordHash=${normalizeHex32(previousRecordHash, "Previous journal record hash")}`,
    `event=${canonicalJournalJson(event)}`,
  ].join("\n"));
}

function validateRecord(value: unknown, expectedSequence: bigint, previousHash: Hex32): JournalRecord {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Journal record must be an object");
  assertExactKeys(value, ["version", "sequence", "previousRecordHash", "event", "recordHash"], "Journal record");
  const record = value as Partial<JournalRecord>;
  if (record.version !== JOURNAL_VERSION) throw new Error("Journal record version is unsupported");
  const sequence = canonicalSequence(String(record.sequence), "Journal sequence");
  if (sequence !== expectedSequence) throw new Error("Journal sequence gap or reordering detected");
  const normalizedPrevious = normalizeHex32(String(record.previousRecordHash), "Previous journal record hash");
  if (normalizedPrevious !== previousHash) throw new Error("Journal record chain is broken");
  if (!record.event || typeof record.event !== "object" || Array.isArray(record.event)) {
    throw new TypeError("Journal event must be an object");
  }
  canonicalJournalJson(record.event);
  const normalizedHash = normalizeHex32(String(record.recordHash), "Journal record hash");
  const expectedHash = hashJournalRecord(sequence, normalizedPrevious, record.event);
  if (normalizedHash !== expectedHash) throw new Error("Journal record hash does not match its contents");
  return {
    version: JOURNAL_VERSION,
    sequence: sequence.toString(),
    previousRecordHash: normalizedPrevious,
    event: record.event,
    recordHash: normalizedHash,
  };
}

export async function readJournal(
  path: string,
  limits: { maxRecords?: number; maxLineBytes?: number } = {},
): Promise<JournalState> {
  const maxRecords = limits.maxRecords ?? DEFAULT_MAX_JOURNAL_RECORDS;
  const maxLineBytes = limits.maxLineBytes ?? DEFAULT_MAX_JOURNAL_LINE_BYTES;
  if (!Number.isSafeInteger(maxRecords) || maxRecords <= 0) throw new RangeError("Maximum journal records must be positive");
  if (!Number.isSafeInteger(maxLineBytes) || maxLineBytes <= 0) throw new RangeError("Maximum journal line bytes must be positive");
  let contents: string;
  try {
    contents = await readFile(path, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { records: [], sequence: 0n, head: JOURNAL_GENESIS_HASH };
    }
    throw error;
  }
  if (contents.length === 0) return { records: [], sequence: 0n, head: JOURNAL_GENESIS_HASH };
  if (!contents.endsWith("\n")) throw new Error("Journal ends with a partial record");
  const lines = contents.slice(0, -1).split("\n");
  if (lines.length > maxRecords) throw new RangeError("Journal record limit exceeded");
  const records: JournalRecord[] = [];
  let sequence = 1n;
  let previousHash = JOURNAL_GENESIS_HASH;
  for (const line of lines) {
    if (Buffer.byteLength(line, "utf8") > maxLineBytes) throw new RangeError("Journal line limit exceeded");
    if (line.length === 0) throw new Error("Journal contains an empty record");
    const record = validateRecord(JSON.parse(line), sequence, previousHash);
    records.push(record);
    sequence += 1n;
    previousHash = record.recordHash;
  }
  return { records, sequence: sequence - 1n, head: previousHash };
}

async function withAppendLock<T>(path: string, work: () => Promise<T>): Promise<T> {
  const prior = appendLocks.get(path) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  const queued = prior.then(() => current);
  appendLocks.set(path, queued);
  await prior;
  try {
    return await work();
  } finally {
    release();
    if (appendLocks.get(path) === queued) appendLocks.delete(path);
  }
}

export async function appendJournal(
  path: string,
  expected: Pick<JournalState, "sequence" | "head">,
  event: Readonly<Record<string, JournalValue>>,
  limits: { maxRecords?: number; maxLineBytes?: number } = {},
): Promise<JournalRecord> {
  return withAppendLock(path, async () => {
    canonicalJournalJson(event);
    const current = await readJournal(path, limits);
    if (current.sequence !== expected.sequence || current.head !== normalizeHex32(expected.head, "Expected journal head")) {
      throw new Error("Journal head changed before append");
    }
    const maxRecords = limits.maxRecords ?? DEFAULT_MAX_JOURNAL_RECORDS;
    if (current.records.length >= maxRecords) throw new RangeError("Journal record limit exceeded");
    const sequence = current.sequence + 1n;
    const record: JournalRecord = {
      version: JOURNAL_VERSION,
      sequence: sequence.toString(),
      previousRecordHash: current.head,
      event,
      recordHash: hashJournalRecord(sequence, current.head, event),
    };
    const line = `${canonicalJournalJson(record)}\n`;
    const maxLineBytes = limits.maxLineBytes ?? DEFAULT_MAX_JOURNAL_LINE_BYTES;
    if (Buffer.byteLength(line, "utf8") > maxLineBytes) throw new RangeError("Journal line limit exceeded");
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    const handle = await open(path, "a", 0o600);
    try {
      await handle.writeFile(line, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    return record;
  });
}

export async function writeJournalCheckpoint(path: string, checkpoint: JournalCheckpoint): Promise<void> {
  const validated = validateCheckpoint(checkpoint);
  const existing = await readJournalCheckpoint(path);
  if (existing) {
    const existingSequence = BigInt(existing.sequence);
    const nextSequence = BigInt(validated.sequence);
    if (nextSequence < existingSequence) throw new Error("Journal checkpoint sequence cannot move backward");
    if (nextSequence === existingSequence && canonicalJournalJson(existing) !== canonicalJournalJson(validated)) {
      throw new Error("Journal checkpoint cannot change at the same sequence");
    }
  }
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await atomicWriteFile(path, `${canonicalJournalJson(validated)}\n`);
}

function validateCheckpoint(value: unknown): JournalCheckpoint {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Journal checkpoint must be an object");
  assertExactKeys(value, ["version", "sequence", "recordHash", "stateRoot", "configurationHash"], "Journal checkpoint");
  const checkpoint = value as Partial<JournalCheckpoint>;
  if (checkpoint.version !== JOURNAL_VERSION) throw new Error("Journal checkpoint version is unsupported");
  const sequence = canonicalSequence(String(checkpoint.sequence), "Checkpoint sequence", true);
  const recordHash = normalizeHex32(String(checkpoint.recordHash), "Checkpoint record hash");
  const stateRoot = normalizeHex32(String(checkpoint.stateRoot), "Checkpoint state root");
  const configurationHash = normalizeHex32(String(checkpoint.configurationHash), "Checkpoint configuration hash");
  if (sequence === 0n && recordHash !== JOURNAL_GENESIS_HASH) throw new Error("Genesis checkpoint has a non-genesis record hash");
  return { version: JOURNAL_VERSION, sequence: sequence.toString(), recordHash, stateRoot, configurationHash };
}

export async function readJournalCheckpoint(path: string): Promise<JournalCheckpoint | null> {
  try {
    return validateCheckpoint(JSON.parse(await readFile(path, "utf8")));
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export function assertCheckpointInJournal(checkpoint: JournalCheckpoint, journal: JournalState): void {
  const validated = validateCheckpoint(checkpoint);
  const sequence = BigInt(validated.sequence);
  if (sequence > journal.sequence) throw new Error("Checkpoint is ahead of the journal");
  const expectedHash = sequence === 0n
    ? JOURNAL_GENESIS_HASH
    : journal.records[Number(sequence - 1n)]?.recordHash;
  if (!expectedHash || expectedHash !== validated.recordHash) {
    throw new Error("Checkpoint does not bind the corresponding journal record");
  }
}
