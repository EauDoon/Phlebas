import { access, mkdir, open, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

import type { TypedOrderIntent } from "../../src/lib/eip712-order.ts";
import {
  applyPersistentMatcherEvent,
  createPersistentMatcher,
  findRequestReceipt,
  matcherCommandHash,
  matcherConfigurationHash,
  matcherStateRoot,
  type MatcherMutationReceipt,
  type PersistentMatcherConfiguration,
  type PersistentMatcherEvent,
  type PersistentMatcherState,
} from "../../src/lib/persistent-matcher.ts";
import type { MatcherSignatureVerifier } from "../../src/lib/matcher-auth.ts";
import { normalizeHex32, UINT64_MAX, type Hex32 } from "../../src/lib/order-domain.ts";
import type { SolverPricePolicy, SolverQuote } from "../../src/lib/solver-quotes.ts";
import { atomicWriteFile } from "../durable-file.ts";
import {
  JOURNAL_GENESIS_HASH,
  DEFAULT_MAX_JOURNAL_BYTES,
  JOURNAL_VERSION,
  appendJournal,
  assertCheckpointInJournal,
  canonicalJournalJson,
  readJournal,
  readJournalCheckpoint,
  writeJournalCheckpoint,
  type JournalCheckpoint,
  type JournalState,
  type JournalValue,
} from "./journal.ts";

type SerializedObject = { [key: string]: JournalValue };

export type PersistentMatcherStoreOptions = Readonly<{
  journalPath: string;
  checkpointPath: string;
  markerPath?: string;
  lockPath?: string;
  configuration: PersistentMatcherConfiguration;
  verifier: MatcherSignatureVerifier;
  maximumJournalRecords?: number;
  maximumJournalLineBytes?: number;
  maximumJournalBytes?: number;
  clockSeconds?: () => bigint;
  maximumFutureEventSeconds?: bigint;
}>;

export type PersistentMutationResult = Readonly<{
  receipt: MatcherMutationReceipt;
  replayed: boolean;
  checkpoint: JournalCheckpoint;
}>;

export const DEFAULT_MAXIMUM_FUTURE_EVENT_SECONDS = 30n;

export class MatcherPersistenceUnavailableError extends Error {
  readonly code = "MATCHER_PERSISTENCE_UNAVAILABLE";

  constructor(operation: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`matcher-persistence-unavailable:${operation}:${detail}`);
    this.name = "MatcherPersistenceUnavailableError";
    this.cause = cause;
  }
}

function defaultClockSeconds(): bigint {
  return BigInt(Math.floor(Date.now() / 1_000));
}

function trustedClock(options: PersistentMatcherStoreOptions): bigint {
  const now = (options.clockSeconds ?? defaultClockSeconds)();
  if (typeof now !== "bigint" || now < 0n || now > UINT64_MAX) {
    throw new RangeError("Matcher clock must return a uint64 bigint");
  }
  return now;
}

function maximumFutureEventSeconds(options: PersistentMatcherStoreOptions): bigint {
  const maximum = options.maximumFutureEventSeconds ?? DEFAULT_MAXIMUM_FUTURE_EVENT_SECONDS;
  if (typeof maximum !== "bigint" || maximum < 0n || maximum > UINT64_MAX) {
    throw new RangeError("Maximum future event time must be a uint64 bigint");
  }
  return maximum;
}

export function assertMatcherEventTime(
  event: PersistentMatcherEvent,
  nowSeconds: bigint,
  maximumFutureSeconds = DEFAULT_MAXIMUM_FUTURE_EVENT_SECONDS,
): void {
  if (typeof nowSeconds !== "bigint" || nowSeconds < 0n || nowSeconds > UINT64_MAX) {
    throw new RangeError("Matcher clock must return a uint64 bigint");
  }
  if (typeof maximumFutureSeconds !== "bigint" || maximumFutureSeconds < 0n || maximumFutureSeconds > UINT64_MAX) {
    throw new RangeError("Maximum future event time must be a uint64 bigint");
  }
  if (typeof event.occurredAtSeconds !== "bigint" || event.occurredAtSeconds < 0n || event.occurredAtSeconds > UINT64_MAX) {
    throw new RangeError("Matcher event time must be a uint64 bigint");
  }
  const maximumAllowed = nowSeconds > UINT64_MAX - maximumFutureSeconds
    ? UINT64_MAX
    : nowSeconds + maximumFutureSeconds;
  if (event.occurredAtSeconds > maximumAllowed) {
    throw new RangeError("Matcher event time is too far in the future");
  }
}

function serializedOrder(order: TypedOrderIntent): SerializedObject {
  return {
    makerAccountId: order.makerAccountId,
    authorizedSignerId: order.authorizedSignerId,
    baseChainId: order.baseChainId,
    baseAssetId: order.baseAssetId,
    quoteChainId: order.quoteChainId,
    quoteAssetId: order.quoteAssetId,
    side: order.side,
    baseAmountAtoms: order.baseAmountAtoms.toString(),
    limitPriceTicks: order.limitPriceTicks.toString(),
    nonce: order.nonce.toString(),
    accountEpoch: order.accountEpoch.toString(),
    expiry: order.expiry.toString(),
    salt: order.salt,
    recipientAccountId: order.recipientAccountId,
    timeInForce: order.timeInForce,
    maximumFeeBps: order.maximumFeeBps.toString(),
    allowedVenues: order.allowedVenues,
    settlementAdapterId: order.settlementAdapterId,
  };
}

function serializedPricePolicy(policy: SolverPricePolicy): SerializedObject {
  if (policy.kind === "fixed") return { kind: "fixed", priceTicks: policy.priceTicks.toString() };
  return {
    kind: "curve",
    levels: policy.levels.map((level) => ({
      cumulativeBaseAtoms: level.cumulativeBaseAtoms.toString(),
      priceTicks: level.priceTicks.toString(),
    })),
  };
}

function serializedQuote(quote: SolverQuote): SerializedObject {
  return {
    version: quote.version,
    matcherDomainHash: quote.matcherDomainHash,
    solverAccountId: quote.solverAccountId,
    authorizedSignerId: quote.authorizedSignerId,
    recipientAccountId: quote.recipientAccountId,
    sourceAccount: quote.sourceAccount,
    recipientAccount: quote.recipientAccount,
    baseNetwork: quote.baseNetwork,
    baseAsset: quote.baseAsset,
    quoteNetwork: quote.quoteNetwork,
    quoteAsset: quote.quoteAsset,
    side: quote.side,
    capacityBaseAtoms: quote.capacityBaseAtoms.toString(),
    minimumFillBaseAtoms: quote.minimumFillBaseAtoms.toString(),
    pricePolicy: serializedPricePolicy(quote.pricePolicy),
    maximumSlippageBps: quote.maximumSlippageBps.toString(),
    feeBps: quote.feeBps.toString(),
    accountEpoch: quote.accountEpoch.toString(),
    nonce: quote.nonce.toString(),
    expirySeconds: quote.expirySeconds.toString(),
    settlementProtocolVersion: quote.settlementProtocolVersion,
  };
}

export function serializePersistentMatcherEvent(
  configuration: PersistentMatcherConfiguration,
  event: PersistentMatcherEvent,
): Readonly<Record<string, JournalValue>> {
  const payload: SerializedObject = {
    version: event.version,
    requestId: event.requestId,
    occurredAtSeconds: event.occurredAtSeconds.toString(),
    kind: event.kind,
  };
  if (event.kind === "accept-order") {
    payload.submission = {
      order: serializedOrder(event.submission.order),
      signature: event.submission.signature,
      accounts: {
        sourceAccount: event.submission.accounts.sourceAccount,
        recipientAccount: event.submission.accounts.recipientAccount,
      },
    };
  } else if (event.kind === "cancel-order") {
    payload.orderHash = event.orderHash;
    payload.signature = event.signature;
  } else if (event.kind === "advance-epoch") {
    payload.makerAccountId = event.makerAccountId;
    payload.nextEpoch = event.nextEpoch.toString();
    payload.authorizedSignerId = event.authorizedSignerId;
    payload.signature = event.signature;
  } else if (event.kind === "accept-solver-quote") {
    payload.quote = serializedQuote(event.quote);
    payload.signature = event.signature;
  } else {
    payload.quoteHash = event.quoteHash;
    payload.signature = event.signature;
  }
  return {
    type: "persistent-matcher-event",
    configurationHash: matcherConfigurationHash(configuration),
    payload,
  };
}

function objectValue(value: JournalValue | undefined, label: string): SerializedObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as SerializedObject;
}

function assertExactKeys(value: SerializedObject, allowed: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const expected = [...allowed].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} has missing or unsupported fields`);
  }
}

function stringValue(value: JournalValue | undefined, label: string): string {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  return value;
}

function integerValue(value: JournalValue | undefined, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new TypeError(`${label} must be a safe integer`);
  return value;
}

function bigintValue(value: JournalValue | undefined, label: string): bigint {
  const text = stringValue(value, label);
  if (!/^(?:0|[1-9][0-9]*)$/.test(text)) throw new TypeError(`${label} must be canonical unsigned decimal`);
  return BigInt(text);
}

function hex32Value(value: JournalValue | undefined, label: string): Hex32 {
  return normalizeHex32(stringValue(value, label), label);
}

function deserializeOrder(value: JournalValue | undefined): TypedOrderIntent {
  const order = objectValue(value, "Serialized order");
  assertExactKeys(order, [
    "makerAccountId", "authorizedSignerId", "baseChainId", "baseAssetId", "quoteChainId", "quoteAssetId",
    "side", "baseAmountAtoms", "limitPriceTicks", "nonce", "accountEpoch", "expiry", "salt",
    "recipientAccountId", "timeInForce", "maximumFeeBps", "allowedVenues", "settlementAdapterId",
  ], "Serialized order");
  const side = integerValue(order.side, "Order side");
  const timeInForce = integerValue(order.timeInForce, "Order time in force");
  if (side !== 0 && side !== 1) throw new RangeError("Order side is invalid");
  if (timeInForce !== 0 && timeInForce !== 1 && timeInForce !== 2) throw new RangeError("Order time in force is invalid");
  return {
    makerAccountId: hex32Value(order.makerAccountId, "Maker account ID"),
    authorizedSignerId: hex32Value(order.authorizedSignerId, "Authorized signer ID"),
    baseChainId: hex32Value(order.baseChainId, "Base chain ID"),
    baseAssetId: hex32Value(order.baseAssetId, "Base asset ID"),
    quoteChainId: hex32Value(order.quoteChainId, "Quote chain ID"),
    quoteAssetId: hex32Value(order.quoteAssetId, "Quote asset ID"),
    side,
    baseAmountAtoms: bigintValue(order.baseAmountAtoms, "Base amount"),
    limitPriceTicks: bigintValue(order.limitPriceTicks, "Limit price"),
    nonce: bigintValue(order.nonce, "Order nonce"),
    accountEpoch: bigintValue(order.accountEpoch, "Account epoch"),
    expiry: bigintValue(order.expiry, "Order expiry"),
    salt: hex32Value(order.salt, "Order salt"),
    recipientAccountId: hex32Value(order.recipientAccountId, "Recipient account ID"),
    timeInForce,
    maximumFeeBps: bigintValue(order.maximumFeeBps, "Maximum fee"),
    allowedVenues: integerValue(order.allowedVenues, "Allowed venues"),
    settlementAdapterId: hex32Value(order.settlementAdapterId, "Settlement adapter ID"),
  };
}

function deserializePricePolicy(value: JournalValue | undefined): SolverPricePolicy {
  const policy = objectValue(value, "Solver price policy");
  const kind = stringValue(policy.kind, "Solver price policy kind");
  if (kind === "fixed") {
    assertExactKeys(policy, ["kind", "priceTicks"], "Solver fixed price policy");
    return { kind, priceTicks: bigintValue(policy.priceTicks, "Solver fixed price") };
  }
  if (kind !== "curve" || !Array.isArray(policy.levels)) throw new TypeError("Solver price policy is invalid");
  assertExactKeys(policy, ["kind", "levels"], "Solver curve price policy");
  return {
    kind,
    levels: policy.levels.map((value, index) => {
      const level = objectValue(value, `Solver curve level ${index}`);
      assertExactKeys(level, ["cumulativeBaseAtoms", "priceTicks"], `Solver curve level ${index}`);
      return {
        cumulativeBaseAtoms: bigintValue(level.cumulativeBaseAtoms, "Solver curve capacity"),
        priceTicks: bigintValue(level.priceTicks, "Solver curve price"),
      };
    }),
  };
}

function deserializeQuote(value: JournalValue | undefined): SolverQuote {
  const quote = objectValue(value, "Serialized solver quote");
  assertExactKeys(quote, [
    "version", "matcherDomainHash", "solverAccountId", "authorizedSignerId", "recipientAccountId", "sourceAccount",
    "recipientAccount", "baseNetwork", "baseAsset", "quoteNetwork", "quoteAsset", "side",
    "capacityBaseAtoms", "minimumFillBaseAtoms", "pricePolicy", "maximumSlippageBps", "feeBps",
    "accountEpoch", "nonce", "expirySeconds", "settlementProtocolVersion",
  ], "Serialized solver quote");
  const version = integerValue(quote.version, "Solver quote version");
  const side = integerValue(quote.side, "Solver quote side");
  if (version !== 1) throw new Error("Solver quote version is unsupported");
  if (side !== 0 && side !== 1) throw new RangeError("Solver quote side is invalid");
  return {
    version,
    matcherDomainHash: hex32Value(quote.matcherDomainHash, "Solver matcher domain hash"),
    solverAccountId: hex32Value(quote.solverAccountId, "Solver account ID"),
    authorizedSignerId: hex32Value(quote.authorizedSignerId, "Solver authorized signer ID"),
    recipientAccountId: hex32Value(quote.recipientAccountId, "Solver recipient account ID"),
    sourceAccount: stringValue(quote.sourceAccount, "Solver source account"),
    recipientAccount: stringValue(quote.recipientAccount, "Solver recipient account"),
    baseNetwork: stringValue(quote.baseNetwork, "Solver base network"),
    baseAsset: stringValue(quote.baseAsset, "Solver base asset"),
    quoteNetwork: stringValue(quote.quoteNetwork, "Solver quote network"),
    quoteAsset: stringValue(quote.quoteAsset, "Solver quote asset"),
    side,
    capacityBaseAtoms: bigintValue(quote.capacityBaseAtoms, "Solver capacity"),
    minimumFillBaseAtoms: bigintValue(quote.minimumFillBaseAtoms, "Solver minimum fill"),
    pricePolicy: deserializePricePolicy(quote.pricePolicy),
    maximumSlippageBps: bigintValue(quote.maximumSlippageBps, "Solver maximum slippage"),
    feeBps: bigintValue(quote.feeBps, "Solver fee"),
    accountEpoch: bigintValue(quote.accountEpoch, "Solver account epoch"),
    nonce: bigintValue(quote.nonce, "Solver quote nonce"),
    expirySeconds: bigintValue(quote.expirySeconds, "Solver quote expiry"),
    settlementProtocolVersion: stringValue(quote.settlementProtocolVersion, "Solver settlement protocol"),
  };
}

export function deserializePersistentMatcherEvent(
  configuration: PersistentMatcherConfiguration,
  value: Readonly<Record<string, JournalValue>>,
): PersistentMatcherEvent {
  assertExactKeys(value as SerializedObject, ["type", "configurationHash", "payload"], "Persisted matcher event");
  if (stringValue(value.type, "Journal event type") !== "persistent-matcher-event") throw new Error("Journal event type is unsupported");
  if (hex32Value(value.configurationHash, "Journal configuration hash") !== matcherConfigurationHash(configuration)) {
    throw new Error("Journal event configuration does not match the matcher");
  }
  const payload = objectValue(value.payload, "Matcher event payload");
  const version = integerValue(payload.version, "Matcher event version");
  if (version !== 1) throw new Error("Matcher event version is unsupported");
  const common = {
    version: 1 as const,
    requestId: stringValue(payload.requestId, "Matcher request ID"),
    occurredAtSeconds: bigintValue(payload.occurredAtSeconds, "Matcher event time"),
  };
  const kind = stringValue(payload.kind, "Matcher event kind");
  if (kind === "accept-order") {
    assertExactKeys(payload, ["version", "requestId", "occurredAtSeconds", "kind", "submission"], "Order event payload");
    const submission = objectValue(payload.submission, "Order submission");
    assertExactKeys(submission, ["order", "signature", "accounts"], "Order submission");
    const accounts = objectValue(submission.accounts, "Settlement accounts");
    assertExactKeys(accounts, ["sourceAccount", "recipientAccount"], "Settlement accounts");
    return {
      ...common,
      kind,
      submission: {
        order: deserializeOrder(submission.order),
        signature: stringValue(submission.signature, "Order signature"),
        accounts: {
          sourceAccount: stringValue(accounts.sourceAccount, "Settlement source account"),
          recipientAccount: stringValue(accounts.recipientAccount, "Settlement recipient account"),
        },
      },
    };
  }
  if (kind === "cancel-order") {
    assertExactKeys(payload, ["version", "requestId", "occurredAtSeconds", "kind", "orderHash", "signature"], "Cancellation event payload");
    return { ...common, kind, orderHash: hex32Value(payload.orderHash, "Cancelled order hash"), signature: stringValue(payload.signature, "Cancellation signature") };
  }
  if (kind === "advance-epoch") {
    assertExactKeys(payload, ["version", "requestId", "occurredAtSeconds", "kind", "makerAccountId", "nextEpoch", "authorizedSignerId", "signature"], "Epoch event payload");
    return {
      ...common,
      kind,
      makerAccountId: hex32Value(payload.makerAccountId, "Maker account ID"),
      nextEpoch: bigintValue(payload.nextEpoch, "Next account epoch"),
      authorizedSignerId: hex32Value(payload.authorizedSignerId, "Authorized signer ID"),
      signature: stringValue(payload.signature, "Epoch signature"),
    };
  }
  if (kind === "accept-solver-quote") {
    assertExactKeys(payload, ["version", "requestId", "occurredAtSeconds", "kind", "quote", "signature"], "Solver quote event payload");
    return { ...common, kind, quote: deserializeQuote(payload.quote), signature: stringValue(payload.signature, "Solver quote signature") };
  }
  if (kind === "cancel-solver-quote") {
    assertExactKeys(payload, ["version", "requestId", "occurredAtSeconds", "kind", "quoteHash", "signature"], "Solver cancellation event payload");
    return { ...common, kind, quoteHash: hex32Value(payload.quoteHash, "Solver quote hash"), signature: stringValue(payload.signature, "Solver quote cancellation signature") };
  }
  throw new Error("Matcher event kind is unsupported");
}

async function pathExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

type WriterLockOwnership = Readonly<{ bytes: string }>;

async function acquireWriterLock(path: string, configurationHash: Hex32): Promise<WriterLockOwnership> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  let handle;
  try {
    handle = await open(path, "wx", 0o600);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error("Matcher writer lock already exists; another writer or explicit stale-lock recovery is required");
    }
    throw error;
  }
  const bytes = `${canonicalJournalJson({
      version: 1,
      pid: process.pid,
      ownerToken: randomUUID(),
      configurationHash,
    })}\n`;
  try {
    await handle.writeFile(bytes, "utf8");
    await handle.sync();
  } finally {
    await handle.close();
  }
  return { bytes };
}

async function releaseWriterLock(path: string, ownership: WriterLockOwnership): Promise<void> {
  let observed: string;
  try {
    observed = await readFile(path, "utf8");
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error("Matcher writer lock disappeared before owned release");
    }
    throw error;
  }
  if (observed !== ownership.bytes) {
    throw new Error("Matcher writer lock ownership changed; refusing to remove an unowned lock");
  }
  await unlink(path);
}

export class PersistentMatcherStore {
  #options: PersistentMatcherStoreOptions;
  #journal: JournalState;
  #state: PersistentMatcherState;
  #checkpoint: JournalCheckpoint;
  #queue = Promise.resolve();
  #closed = false;
  #fault: MatcherPersistenceUnavailableError | null = null;
  #lockOwnership: WriterLockOwnership;

  private constructor(
    options: PersistentMatcherStoreOptions,
    journal: JournalState,
    state: PersistentMatcherState,
    checkpoint: JournalCheckpoint,
    lockOwnership: WriterLockOwnership,
  ) {
    this.#options = options;
    this.#journal = journal;
    this.#state = state;
    this.#checkpoint = checkpoint;
    this.#lockOwnership = lockOwnership;
  }

  static async open(options: PersistentMatcherStoreOptions): Promise<PersistentMatcherStore> {
    const normalizedOptions: PersistentMatcherStoreOptions = {
      ...options,
      markerPath: options.markerPath ?? `${options.journalPath}.initialized`,
      lockPath: options.lockPath ?? `${options.journalPath}.lock`,
      maximumJournalBytes: options.maximumJournalBytes ?? DEFAULT_MAX_JOURNAL_BYTES,
      clockSeconds: options.clockSeconds ?? defaultClockSeconds,
      maximumFutureEventSeconds: options.maximumFutureEventSeconds ?? DEFAULT_MAXIMUM_FUTURE_EVENT_SECONDS,
    };
    const markerPath = normalizedOptions.markerPath as string;
    const lockPath = normalizedOptions.lockPath as string;
    const configurationHash = matcherConfigurationHash(normalizedOptions.configuration);
    const lockOwnership = await acquireWriterLock(lockPath, configurationHash);
    try {
      const markerExists = await pathExists(markerPath);
      const journalExists = await pathExists(normalizedOptions.journalPath);
      const checkpointExists = await pathExists(normalizedOptions.checkpointPath);
      const initial = createPersistentMatcher(normalizedOptions.configuration);
      if (!markerExists) {
        if (journalExists || checkpointExists) throw new Error("Uninitialized matcher has pre-existing persistence files");
        await atomicWriteFile(normalizedOptions.journalPath, "");
        const genesisCheckpoint: JournalCheckpoint = {
          version: JOURNAL_VERSION,
          sequence: "0",
          recordHash: JOURNAL_GENESIS_HASH,
          stateRoot: matcherStateRoot(initial),
          configurationHash,
        };
        await writeJournalCheckpoint(normalizedOptions.checkpointPath, genesisCheckpoint);
        await atomicWriteFile(markerPath, `persistent-matcher-v1:${configurationHash}\n`);
      } else {
        const marker = await readFile(markerPath, "utf8");
        if (marker !== `persistent-matcher-v1:${configurationHash}\n`) throw new Error("Matcher initialization marker does not match its configuration");
        if (!journalExists || !checkpointExists) throw new Error("Initialized matcher persistence is missing");
      }

      const journal = await readJournal(normalizedOptions.journalPath, {
        maxRecords: normalizedOptions.maximumJournalRecords,
        maxLineBytes: normalizedOptions.maximumJournalLineBytes,
        maxBytes: normalizedOptions.maximumJournalBytes,
      });
      const checkpoint = await readJournalCheckpoint(normalizedOptions.checkpointPath);
      if (!checkpoint) throw new Error("Initialized matcher checkpoint is missing");
      if (checkpoint.configurationHash !== configurationHash) throw new Error("Matcher checkpoint configuration does not match");
      assertCheckpointInJournal(checkpoint, journal);
      const checkpointSequence = BigInt(checkpoint.sequence);
      let state = initial;
      if (checkpointSequence === 0n && matcherStateRoot(state) !== checkpoint.stateRoot) {
        throw new Error("Matcher genesis checkpoint state root does not match replay");
      }
      const replayNow = trustedClock(normalizedOptions);
      const maximumFutureSeconds = maximumFutureEventSeconds(normalizedOptions);
      for (const record of journal.records) {
        const event = deserializePersistentMatcherEvent(normalizedOptions.configuration, record.event);
        assertMatcherEventTime(event, replayNow, maximumFutureSeconds);
        state = applyPersistentMatcherEvent(state, event, BigInt(record.sequence), normalizedOptions.verifier).state;
        if (BigInt(record.sequence) === checkpointSequence && matcherStateRoot(state) !== checkpoint.stateRoot) {
          throw new Error("Matcher checkpoint state root does not match replay");
        }
      }
      const currentCheckpoint: JournalCheckpoint = {
        version: JOURNAL_VERSION,
        sequence: journal.sequence.toString(),
        recordHash: journal.head,
        stateRoot: matcherStateRoot(state),
        configurationHash,
      };
      if (canonicalJournalJson(checkpoint) !== canonicalJournalJson(currentCheckpoint)) {
        await writeJournalCheckpoint(normalizedOptions.checkpointPath, currentCheckpoint);
      }
      return new PersistentMatcherStore(normalizedOptions, journal, state, currentCheckpoint, lockOwnership);
    } catch (error) {
      await releaseWriterLock(lockPath, lockOwnership).catch(() => undefined);
      throw error;
    }
  }

  get state(): PersistentMatcherState {
    return this.#state;
  }

  get journal(): JournalState {
    return this.#journal;
  }

  get checkpoint(): JournalCheckpoint {
    return this.#checkpoint;
  }

  get acceptingMutations(): boolean {
    return !this.#closed && this.#fault === null;
  }

  get faultReason(): string | null {
    return this.#fault?.message ?? null;
  }

  get fault(): MatcherPersistenceUnavailableError | null {
    return this.#fault;
  }

  async mutate(event: PersistentMatcherEvent): Promise<PersistentMutationResult> {
    if (this.#closed) throw new Error("Matcher store is closed");
    if (this.#fault) throw this.#fault;
    const issued = this.#queue.then(() => this.#mutate(event));
    this.#queue = issued.then(() => undefined, () => undefined);
    return issued;
  }

  async #mutate(event: PersistentMatcherEvent): Promise<PersistentMutationResult> {
    if (this.#fault) throw this.#fault;
    assertMatcherEventTime(event, trustedClock(this.#options), maximumFutureEventSeconds(this.#options));
    const commandHash = matcherCommandHash(this.#options.configuration, event);
    const prior = findRequestReceipt(this.#state, event.requestId, commandHash);
    if (prior) {
      try {
        await this.#writeCheckpoint();
      } catch (error: unknown) {
        throw this.#markFault("checkpoint", error);
      }
      return { receipt: prior, replayed: true, checkpoint: this.#checkpoint };
    }
    const sequence = this.#state.sequence + 1n;
    const candidate = applyPersistentMatcherEvent(this.#state, event, sequence, this.#options.verifier);
    let record;
    try {
      record = await appendJournal(
        this.#options.journalPath,
        this.#journal,
        serializePersistentMatcherEvent(this.#options.configuration, event),
        {
          maxRecords: this.#options.maximumJournalRecords,
          maxLineBytes: this.#options.maximumJournalLineBytes,
          maxBytes: this.#options.maximumJournalBytes,
        },
      );
      if (BigInt(record.sequence) !== sequence) throw new Error("Persisted journal sequence differs from the prepared matcher event");
    } catch (error: unknown) {
      throw this.#markFault("journal-append", error);
    }
    this.#state = candidate.state;
    this.#journal = {
      records: [...this.#journal.records, record],
      sequence,
      head: record.recordHash,
      byteLength: this.#journal.byteLength + Buffer.byteLength(`${canonicalJournalJson(record)}\n`, "utf8"),
    };
    try {
      await this.#writeCheckpoint();
    } catch (error: unknown) {
      throw this.#markFault("checkpoint", error);
    }
    return { receipt: candidate.receipt, replayed: false, checkpoint: this.#checkpoint };
  }

  #markFault(operation: string, error: unknown): MatcherPersistenceUnavailableError {
    if (this.#fault) return this.#fault;
    this.#fault = error instanceof MatcherPersistenceUnavailableError
      ? error
      : new MatcherPersistenceUnavailableError(operation, error);
    return this.#fault;
  }

  async #writeCheckpoint(): Promise<void> {
    const checkpoint: JournalCheckpoint = {
      version: JOURNAL_VERSION,
      sequence: this.#journal.sequence.toString(),
      recordHash: this.#journal.head,
      stateRoot: matcherStateRoot(this.#state),
      configurationHash: matcherConfigurationHash(this.#options.configuration),
    };
    await writeJournalCheckpoint(this.#options.checkpointPath, checkpoint);
    this.#checkpoint = checkpoint;
  }

  async close(): Promise<void> {
    if (this.#closed) return;
    this.#closed = true;
    await this.#queue;
    await releaseWriterLock(this.#options.lockPath ?? `${this.#options.journalPath}.lock`, this.#lockOwnership);
  }
}
