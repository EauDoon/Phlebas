import { randomUUID } from "node:crypto";
import { mkdir, open as openFile, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

import { UINT64_MAX, normalizeHex32, type Hex32 } from "../../src/lib/order-domain.ts";
import {
  appendSwapEvent,
  emptySwapJournal,
  hashSwapEventPayload,
  type SwapEventPayload,
  type SwapEventReceipt,
  type SwapJournal,
} from "../../src/lib/swap-journal.ts";
import {
  createSwapSnapshot,
  restoreSwapSnapshot,
  type SwapSnapshot,
} from "../../src/lib/swap-replay.ts";
import { swapStateRoot } from "../../src/lib/swap-root.ts";
import type {
  FundingFact,
  FundingEvidence,
  ObserverAttestation,
  SpendFact,
  SpendEvidence,
  SwapState,
} from "../../src/lib/swap-state.ts";
import { atomicWriteFile as defaultAtomicWriteFile, syncDirectory } from "../durable-file.ts";
import { canonicalJournalJson, type JournalValue } from "../matcher/journal.ts";
import { parseStrictJson } from "../matcher/strict-json.ts";

export const PERSISTENCE_FORMAT_VERSION = 1 as const;
export const PERSISTENCE_STORE_FILE = "store.json";
export const PERSISTENCE_LOCK_FILE = "writer.lock";
export const DEFAULT_MAXIMUM_BYTES = 16 * 1024 * 1024;
export const DEFAULT_MAXIMUM_EVENTS = 10_000;

const MAXIMUM_JSON_DEPTH = 32;
const MAXIMUM_JSON_NODES = 1_000_000;
const MAXIMUM_ALLOWED_BYTES = 256 * 1024 * 1024;
const MAXIMUM_ALLOWED_EVENTS = 1_000_000;
const LOCK_VERSION = 1 as const;

type JsonObject = { [key: string]: JournalValue };
type AtomicWriter = (path: string, contents: string) => Promise<void>;

export type PersistentSwapStoreOptions = Readonly<{
  directory: string;
  initialState: SwapState;
  maximumBytes?: number;
  maximumEvents?: number;
  atomicWrite?: AtomicWriter;
}>;

export type ExpectedSwapHead = Readonly<{
  journalHead: Hex32;
  stateRoot: Hex32;
}>;

export type PersistentSwapMutation = Readonly<{
  journal: SwapJournal;
  snapshot: SwapSnapshot;
  state: SwapState;
  receipt: SwapEventReceipt;
  appended: boolean;
}>;

type PersistentSwapStoreDocument = Readonly<{
  version: typeof PERSISTENCE_FORMAT_VERSION;
  swapId: Hex32;
  termsHash: Hex32;
  initialStateRoot: Hex32;
  events: readonly JsonObject[];
  snapshot: JsonObject;
}>;

type LockOwnership = Readonly<{
  path: string;
  bytes: string;
}>;

const FUNDING_FACT_BIGINT_FIELDS = [
  "blockHeight", "executedAtSeconds", "outputIndex", "amountAtoms", "refundTime",
] as const;
const SPEND_FACT_BIGINT_FIELDS = [
  "fundingOutputIndex", "blockHeight", "executedAtSeconds", "inputOrLogIndex", "amountAtoms",
] as const;
const ATTESTATION_BIGINT_FIELDS = ["observedAtSeconds", "tipBlockHeight"] as const;

function assertPositiveSafeInteger(value: number, label: string, maximum: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(`${label} must be a positive safe integer at most ${maximum}`);
  }
  return value;
}

function optionsWithDefaults(options: PersistentSwapStoreOptions): Required<PersistentSwapStoreOptions> {
  const maximumBytes = assertPositiveSafeInteger(
    options.maximumBytes ?? DEFAULT_MAXIMUM_BYTES,
    "Maximum persistence bytes",
    MAXIMUM_ALLOWED_BYTES,
  );
  const maximumEvents = assertPositiveSafeInteger(
    options.maximumEvents ?? DEFAULT_MAXIMUM_EVENTS,
    "Maximum persistence events",
    MAXIMUM_ALLOWED_EVENTS,
  );
  return {
    ...options,
    maximumBytes,
    maximumEvents,
    atomicWrite: options.atomicWrite ?? defaultAtomicWriteFile,
  };
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function plainObject(value: unknown, label: string): JsonObject {
  if (!isJsonObject(value)) throw new TypeError(`${label} must be an object`);
  return { ...value };
}

function arrayValue(value: unknown, label: string): readonly JournalValue[] {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  return value;
}

function exactKeys(value: JsonObject, allowed: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has missing or unsupported fields`);
  }
}

function versionValue(value: JournalValue | undefined, label: string): 1 {
  if (typeof value !== "number" || value !== 1) throw new Error(`${label} is unsupported`);
  return 1;
}

function integerString(value: unknown, label: string): bigint {
  if (typeof value !== "string") throw new TypeError(`${label} must be a canonical decimal string`);
  const text = value;
  if (!/^(?:0|[1-9][0-9]*)$/.test(text)) throw new TypeError(`${label} must be a canonical decimal string`);
  if (text.length > 20) throw new RangeError(`${label} must fit uint64`);
  const parsed = BigInt(text);
  if (parsed > UINT64_MAX) throw new RangeError(`${label} must fit uint64`);
  return parsed;
}

function hex32Value(value: JournalValue | undefined, label: string): Hex32 {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const text = value;
  const normalized = normalizeHex32(text, label);
  if (normalized !== text) throw new TypeError(`${label} must be canonical`);
  return normalized;
}

function encodeBigIntFields(value: object, fields: readonly string[], label: string): JsonObject {
  const result = { ...value } as Record<string, unknown>;
  for (const field of fields) {
    const number = result[field];
    if (typeof number !== "bigint") throw new TypeError(`${label}.${field} must be a bigint`);
    result[field] = number.toString();
  }
  return result as JsonObject;
}

function decodeBigIntFields(value: JournalValue | undefined, fields: readonly string[], label: string): Record<string, unknown> {
  const result = plainObject(value, label) as Record<string, unknown>;
  for (const field of fields) result[field] = integerString(result[field], `${label}.${field}`);
  return result;
}

function encodeAttestation(attestation: ObserverAttestation): JsonObject {
  return encodeBigIntFields(attestation, ATTESTATION_BIGINT_FIELDS, "Observer attestation");
}

function decodeAttestation(value: JournalValue | undefined): ObserverAttestation {
  return decodeBigIntFields(value, ATTESTATION_BIGINT_FIELDS, "Observer attestation") as ObserverAttestation;
}

function encodeFundingFact(fact: FundingFact): JsonObject {
  return encodeBigIntFields(fact, FUNDING_FACT_BIGINT_FIELDS, "Funding fact");
}

function decodeFundingFact(value: JournalValue | undefined): FundingFact {
  return decodeBigIntFields(value, FUNDING_FACT_BIGINT_FIELDS, "Funding fact") as FundingFact;
}

function encodeSpendFact(fact: SpendFact): JsonObject {
  return encodeBigIntFields(fact, SPEND_FACT_BIGINT_FIELDS, "Spend fact");
}

function decodeSpendFact(value: JournalValue | undefined): SpendFact {
  return decodeBigIntFields(value, SPEND_FACT_BIGINT_FIELDS, "Spend fact") as SpendFact;
}

function encodeFundingEvidence(evidence: FundingEvidence): JsonObject {
  return { ...evidence, fact: encodeFundingFact(evidence.fact), attestation: encodeAttestation(evidence.attestation) };
}

function decodeFundingEvidence(value: JournalValue | undefined): FundingEvidence {
  const evidence = plainObject(value, "Funding evidence");
  return {
    ...evidence,
    fact: decodeFundingFact(evidence.fact),
    attestation: decodeAttestation(evidence.attestation),
  } as FundingEvidence;
}

function encodeSpendEvidence(evidence: SpendEvidence): JsonObject {
  return { ...evidence, fact: encodeSpendFact(evidence.fact), attestation: encodeAttestation(evidence.attestation) };
}

function decodeSpendEvidence(value: JournalValue | undefined): SpendEvidence {
  const evidence = plainObject(value, "Spend evidence");
  return {
    ...evidence,
    fact: decodeSpendFact(evidence.fact),
    attestation: decodeAttestation(evidence.attestation),
  } as SpendEvidence;
}

function encodePayload(payload: SwapEventPayload): JsonObject {
  switch (payload.kind) {
    case "authorize-terms":
    case "prepare-funding":
    case "abandon-funding":
    case "expire-swap":
      return encodeBigIntFields(payload, ["occurredAtSeconds"], "Swap event");
    case "observe-funding":
      return { ...payload, evidence: encodeFundingEvidence(payload.evidence) };

    case "observe-spend":
      return { ...payload, evidence: encodeSpendEvidence(payload.evidence) };
    case "confirm-funding":
    case "confirm-spend":
      return encodeBigIntFields(payload, ["qualifiedAtSeconds"], "Confirmation event");
    case "flag-dispute":
    case "retract-evidence":
      return { ...payload };
    case "replace-funding-attestation":
      return {
        ...payload,
        replacement: encodeFundingEvidence(payload.replacement),
        occurredAtSeconds: payload.occurredAtSeconds.toString(),
      };
    case "replace-spend-attestation":
      return {
        ...payload,
        replacement: encodeSpendEvidence(payload.replacement),
        occurredAtSeconds: payload.occurredAtSeconds.toString(),
      };
    default:
      throw new TypeError("Unknown swap event kind");
  }
}

function decodePayload(value: JournalValue | undefined): SwapEventPayload {
  const payload = plainObject(value, "Swap event payload");
  if (typeof payload.kind !== "string") throw new TypeError("Swap event kind must be a string");
  const kind = payload.kind;
  let decoded: SwapEventPayload;
  switch (kind) {
    case "authorize-terms":
    case "prepare-funding":
    case "abandon-funding":
    case "expire-swap":
      decoded = decodeBigIntFields(payload, ["occurredAtSeconds"], "Swap event") as unknown as SwapEventPayload;
      break;
    case "observe-funding":
      decoded = { ...payload, evidence: decodeFundingEvidence(payload.evidence) } as unknown as SwapEventPayload;
      break;
    case "observe-spend":
      decoded = { ...payload, evidence: decodeSpendEvidence(payload.evidence) } as unknown as SwapEventPayload;
      break;
    case "confirm-funding":
    case "confirm-spend":
      decoded = decodeBigIntFields(payload, ["qualifiedAtSeconds"], "Confirmation event") as unknown as SwapEventPayload;
      break;
    case "flag-dispute":
    case "retract-evidence":
      decoded = payload as unknown as SwapEventPayload;
      break;
    case "replace-funding-attestation":
      decoded = {
        ...decodeBigIntFields(payload, ["occurredAtSeconds"], "Funding replacement event"),
        replacement: decodeFundingEvidence(payload.replacement),
      } as unknown as SwapEventPayload;
      break;
    case "replace-spend-attestation":
      decoded = {
        ...decodeBigIntFields(payload, ["occurredAtSeconds"], "Spend replacement event"),
        replacement: decodeSpendEvidence(payload.replacement),
      } as unknown as SwapEventPayload;
      break;
    default:
      throw new Error("Swap event kind is unsupported");
  }
  hashSwapEventPayload(decoded);
  return decoded;
}

function encodeSnapshot(snapshot: SwapSnapshot): JsonObject {
  return {
    version: snapshot.version,
    swapId: snapshot.swapId,
    termsHash: snapshot.termsHash,
    journalHead: snapshot.journalHead,
    nextSequence: snapshot.nextSequence.toString(),
    stateRoot: snapshot.stateRoot,
    snapshotRoot: snapshot.snapshotRoot,
  };
}

function decodeSnapshot(value: JournalValue | undefined): SwapSnapshot {
  const snapshot = plainObject(value, "Swap snapshot");
  exactKeys(snapshot, ["version", "swapId", "termsHash", "journalHead", "nextSequence", "stateRoot", "snapshotRoot"], "Swap snapshot");
  return {
    version: versionValue(snapshot.version, "Swap snapshot version"),
    swapId: hex32Value(snapshot.swapId, "Snapshot swap ID"),
    termsHash: hex32Value(snapshot.termsHash, "Snapshot terms hash"),
    journalHead: hex32Value(snapshot.journalHead, "Snapshot journal head"),
    nextSequence: integerString(snapshot.nextSequence, "Snapshot next sequence"),
    stateRoot: hex32Value(snapshot.stateRoot, "Snapshot state root"),
    snapshotRoot: hex32Value(snapshot.snapshotRoot, "Snapshot root"),
  };
}

function encodeDocument(
  initialState: SwapState,
  events: readonly SwapEventPayload[],
  snapshot: SwapSnapshot,
): PersistentSwapStoreDocument {
  return {
    version: PERSISTENCE_FORMAT_VERSION,
    swapId: initialState.swapId,
    termsHash: initialState.termsHash,
    initialStateRoot: swapStateRoot(initialState),
    events: events.map(encodePayload),
    snapshot: encodeSnapshot(snapshot),
  };
}

function documentBytes(document: PersistentSwapStoreDocument): string {
  return `${canonicalJournalJson(document)}\n`;
}

function decodeDocument(
  value: JournalValue,
  expected: { initialState: SwapState; maximumEvents: number },
): { events: readonly SwapEventPayload[]; snapshot: SwapSnapshot } {
  const object = plainObject(value, "Persistent swap store");
  exactKeys(object, ["version", "swapId", "termsHash", "initialStateRoot", "events", "snapshot"], "Persistent swap store");
  versionValue(object.version, "Persistent swap store version");
  const swapId = hex32Value(object.swapId, "Persisted swap ID");
  const termsHash = hex32Value(object.termsHash, "Persisted terms hash");
  const initialStateRoot = hex32Value(object.initialStateRoot, "Persisted initial state root");
  if (swapId !== expected.initialState.swapId || termsHash !== expected.initialState.termsHash) {
    throw new Error("Persistent swap store identity does not match the trusted initial state");
  }
  if (initialStateRoot !== swapStateRoot(expected.initialState)) {
    throw new Error("Persistent swap store initial state root does not match the trusted initial state");
  }
  const rawEvents = arrayValue(object.events, "Persistent swap events");
  if (rawEvents.length > expected.maximumEvents) throw new RangeError("Persistent swap event limit exceeded");
  const events = rawEvents.map((event) => decodePayload(event));
  const snapshot = decodeSnapshot(object.snapshot);
  return { events, snapshot };
}

async function readBounded(path: string, maximumBytes: number, label: string): Promise<string> {
  const handle = await openFile(path, "r");
  try {
    const before = await handle.stat();
    if (!Number.isSafeInteger(before.size) || before.size < 0 || before.size > maximumBytes) {
      throw new RangeError(`${label} exceeds its byte limit`);
    }
    const chunks: Buffer[] = [];
    let total = 0;
    while (total <= maximumBytes) {
      const length = Math.min(64 * 1024, maximumBytes + 1 - total);
      const chunk = Buffer.alloc(length);
      const result = await handle.read(chunk, 0, length, null);
      if (result.bytesRead === 0) break;
      total += result.bytesRead;
      if (total > maximumBytes) throw new RangeError(`${label} exceeds its byte limit`);
      chunks.push(result.bytesRead === chunk.length ? chunk : chunk.subarray(0, result.bytesRead));
    }
    const after = await handle.stat();
    if (after.size !== before.size || after.size !== total) throw new Error(`${label} changed while reading`);
    return Buffer.concat(chunks, total).toString("utf8");
  } finally {
    await handle.close();
  }
}

function parseCanonicalJson(raw: string, label: string): JournalValue {
  let parsed: JournalValue;
  try {
    parsed = parseStrictJson(raw, { maximumDepth: MAXIMUM_JSON_DEPTH, maximumNodes: MAXIMUM_JSON_NODES });
  } catch (error: unknown) {
    throw new Error(`${label} is not valid bounded JSON`, { cause: error });
  }
  return parsed;
}

async function acquireLock(path: string, initialState: SwapState): Promise<LockOwnership> {
  const bytes = `${canonicalJournalJson({
    version: LOCK_VERSION,
    ownerToken: randomUUID(),
    swapId: initialState.swapId,
  })}\n`;
  let handle;
  try {
    handle = await openFile(path, "wx", 0o600);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Persistent swap writer lock already exists; explicit stale-lock recovery is required");
    }
    throw error;
  }
  try {
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  await syncDirectory(dirname(path));
  return { path, bytes };
}

async function assertLockOwned(ownership: LockOwnership, phase: string): Promise<void> {
  let observed: string;
  try {
    observed = await readBounded(ownership.path, 4 * 1024, "Persistent swap writer lock");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Persistent swap writer lock disappeared during ${phase}`, { cause: error });
    }
    throw error;
  }
  if (observed !== ownership.bytes) {
    throw new Error(`Persistent swap writer lock ownership changed during ${phase}`);
  }
}

async function releaseLock(ownership: LockOwnership): Promise<void> {
  await assertLockOwned(ownership, "release");
  await unlink(ownership.path);
  await syncDirectory(dirname(ownership.path));
}

function cloneAndFreeze<T>(value: T): T {
  const cloned = structuredClone(value);
  const seen = new WeakSet<object>();
  function freeze(item: unknown): void {
    if (typeof item !== "object" || item === null || seen.has(item)) return;
    seen.add(item);
    for (const child of Object.values(item as Record<string, unknown>)) freeze(child);
    Object.freeze(item);
  }
  freeze(cloned);
  return cloned;
}

function trustedInitialState(initialState: SwapState): SwapState {
  const cloned = cloneAndFreeze(initialState);
  emptySwapJournal(cloned);
  return cloned;
}

// ponytail: bounded history plus full-document rewrite is the deliberate O(n) ceiling; no compaction layer.
async function readStoreDocument(
  options: Required<PersistentSwapStoreOptions>,
  initialState: SwapState,
): Promise<{ events: readonly SwapEventPayload[]; snapshot: SwapSnapshot }> {
  const raw = await readBounded(join(options.directory, PERSISTENCE_STORE_FILE), options.maximumBytes, "Persistent swap store");
  const parsed = parseCanonicalJson(raw, "Persistent swap store");
  const decoded = decodeDocument(parsed, { initialState, maximumEvents: options.maximumEvents });
  const canonical = documentBytes(encodeDocument(initialState, decoded.events, decoded.snapshot));
  if (raw !== canonical) throw new Error("Persistent swap store is not canonical");
  return { events: decoded.events, snapshot: decoded.snapshot };
}

async function ensureDirectory(path: string): Promise<void> {
  const directory = await stat(path);
  if (!directory.isDirectory()) throw new Error("Persistent swap store path is not a directory");
}

function validatePersistedState(
  initialState: SwapState,
  events: readonly SwapEventPayload[],
  snapshot: SwapSnapshot,
): { journal: SwapJournal; state: SwapState } {
  let journal = emptySwapJournal(initialState);
  let state = initialState;
  for (const [index, payload] of events.entries()) {
    const result = appendSwapEvent(journal, state, payload);
    if (!result.appended) throw new Error(`Persistent swap event ${index} is a duplicate`);
    journal = result.journal;
    state = result.state;
  }
  restoreSwapSnapshot(initialState, journal, snapshot);
  return { journal: cloneAndFreeze(journal), state: cloneAndFreeze(state) };
}

export class PersistentSwapStore {
  #options: Required<PersistentSwapStoreOptions>;
  #initialState: SwapState;
  #journal: SwapJournal;
  #state: SwapState;
  #snapshot: SwapSnapshot;
  #lock: LockOwnership;
  #queue = Promise.resolve();
  #closed = false;
  #closePromise: Promise<void> | null = null;
  #poison: Error | null = null;

  private constructor(
    options: Required<PersistentSwapStoreOptions>,
    initialState: SwapState,
    journal: SwapJournal,
    state: SwapState,
    snapshot: SwapSnapshot,
    lock: LockOwnership,
  ) {
    this.#options = options;
    this.#initialState = initialState;
    this.#journal = journal;
    this.#state = state;
    this.#snapshot = snapshot;
    this.#lock = lock;
  }

  static async initialize(options: PersistentSwapStoreOptions): Promise<PersistentSwapStore> {
    const normalized = optionsWithDefaults(options);
    const initialState = trustedInitialState(normalized.initialState);
    // Exclusive directory creation is the permanent local initialization marker. A local backup can roll it back with store.json, so rollback anchoring remains an operator concern.
    await mkdir(normalized.directory, { mode: 0o700 });
    await syncDirectory(dirname(normalized.directory));
    const lock = await acquireLock(join(normalized.directory, PERSISTENCE_LOCK_FILE), initialState);
    try {
      const journal = emptySwapJournal(initialState);
      const snapshot = createSwapSnapshot(initialState, journal);
      const bytes = documentBytes(encodeDocument(initialState, [], snapshot));
      if (Buffer.byteLength(bytes, "utf8") > normalized.maximumBytes) throw new RangeError("Initial persistence exceeds its byte limit");
      await assertLockOwned(lock, "initialization");
      await normalized.atomicWrite(join(normalized.directory, PERSISTENCE_STORE_FILE), bytes);
      await assertLockOwned(lock, "initialization commit");
      return new PersistentSwapStore(
        normalized,
        initialState,
        cloneAndFreeze(journal),
        initialState,
        cloneAndFreeze(snapshot),
        lock,
      );
    } catch (error) {
      await releaseLock(lock).catch(() => undefined);
      throw error;
    }
  }

  static async open(options: PersistentSwapStoreOptions): Promise<PersistentSwapStore> {
    const normalized = optionsWithDefaults(options);
    const initialState = trustedInitialState(normalized.initialState);
    await ensureDirectory(normalized.directory);
    const lock = await acquireLock(join(normalized.directory, PERSISTENCE_LOCK_FILE), initialState);
    try {
      const persisted = await readStoreDocument(normalized, initialState);
      const restored = validatePersistedState(initialState, persisted.events, persisted.snapshot);
      return new PersistentSwapStore(
        normalized,
        initialState,
        restored.journal,
        restored.state,
        cloneAndFreeze(persisted.snapshot),
        lock,
      );
    } catch (error) {
      await releaseLock(lock).catch(() => undefined);
      throw error;
    }
  }

  get state(): SwapState {
    return cloneAndFreeze(this.#state);
  }

  get journal(): SwapJournal {
    return cloneAndFreeze(this.#journal);
  }

  get snapshot(): SwapSnapshot {
    return cloneAndFreeze(this.#snapshot);
  }

  get poisoned(): boolean {
    return this.#poison !== null;
  }

  get poisonReason(): string | null {
    return this.#poison?.message ?? null;
  }

  async append(expected: ExpectedSwapHead, payload: SwapEventPayload): Promise<PersistentSwapMutation> {
    if (this.#closed) throw new Error("Persistent swap store is closed");
    if (this.#poison) throw this.#poison;
    const ownedExpected = structuredClone(expected);
    const ownedPayload = structuredClone(payload);
    const issued = this.#queue.then(() => this.#append(ownedExpected, ownedPayload));
    this.#queue = issued.then(() => undefined, () => undefined);
    return issued;
  }

  async #append(expected: ExpectedSwapHead, payload: SwapEventPayload): Promise<PersistentSwapMutation> {
    if (this.#poison) throw this.#poison;
    try {
      await assertLockOwned(this.#lock, "mutation");
    } catch (error: unknown) {
      this.#poison = this.#poison ?? new Error("Persistent swap store poisoned after writer ownership changed", { cause: error });
      throw this.#poison;
    }
    const expectedHead = normalizeHex32(expected.journalHead, "Expected journal head");
    const expectedRoot = normalizeHex32(expected.stateRoot, "Expected state root");
    const currentRoot = swapStateRoot(this.#state);
    if (this.#journal.head !== expectedHead) throw new Error("Expected journal head does not match the current swap journal");
    if (currentRoot !== expectedRoot) throw new Error("Expected state root does not match the current swap state");

    const result = appendSwapEvent(this.#journal, this.#state, payload);
    if (!result.appended) {
      return {
        journal: this.journal,
        snapshot: this.snapshot,
        state: this.state,
        receipt: cloneAndFreeze(result.receipt),
        appended: false,
      };
    }

    if (this.#journal.receipts.length >= this.#options.maximumEvents) throw new RangeError("Persistent swap event limit exceeded");
    const nextEvents = result.journal.receipts.map((receipt) => receipt.payload);
    const nextJournal = cloneAndFreeze(result.journal);
    const nextState = cloneAndFreeze(result.state);
    const nextSnapshot = cloneAndFreeze(createSwapSnapshot(this.#initialState, nextJournal));
    const bytes = documentBytes(encodeDocument(this.#initialState, nextEvents, nextSnapshot));
    if (Buffer.byteLength(bytes, "utf8") > this.#options.maximumBytes) throw new RangeError("Persistent swap byte limit exceeded");

    try {
      await assertLockOwned(this.#lock, "mutation");
    } catch (error: unknown) {
      this.#poison = this.#poison ?? new Error("Persistent swap store poisoned after writer ownership changed", { cause: error });
      throw this.#poison;
    }
    try {
      await this.#options.atomicWrite(join(this.#options.directory, PERSISTENCE_STORE_FILE), bytes);
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      this.#poison = new Error(`Persistent swap store poisoned after uncertain write: ${detail}`, { cause: error });
      throw this.#poison;
    }
    try {
      await assertLockOwned(this.#lock, "mutation");
    } catch (error: unknown) {
      this.#poison = new Error("Persistent swap store poisoned after writer ownership changed during commit", { cause: error });
      throw this.#poison;
    }
    this.#journal = nextJournal;
    this.#state = nextState;
    this.#snapshot = nextSnapshot;
    return {
      journal: this.journal,
      snapshot: this.snapshot,
      state: this.state,
      receipt: cloneAndFreeze(result.receipt),
      appended: true,
    };
  }

  close(): Promise<void> {
    if (this.#closePromise) return this.#closePromise;
    this.#closed = true;
    this.#closePromise = this.#queue.then(() => releaseLock(this.#lock));
    return this.#closePromise;
  }
}
