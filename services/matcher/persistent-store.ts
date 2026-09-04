import { access, mkdir, open, readFile, unlink } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

import type { TypedOrderIntent } from "../../src/lib/eip712-order.ts";
import {
  applyPersistentMatcherEvent,
  createPersistentMatcher,
  findRequestReceipt,
  matcherControlAuthorizationCutoverRequestId,
  matcherCommandHash,
  matcherConfigurationHash,
  matcherStateRoot,
  EIP712_MATCHER_CONTROL_AUTHORIZATION_SCHEME,
  LEGACY_RAW_MATCHER_CONTROL_AUTHORIZATION_SCHEME,
  MATCHER_SYSTEM_REQUEST_ID_PREFIX,
  type MatcherMutationReceipt,
  type MatcherControlAuthorizationScheme,
  type PersistentMatcherConfiguration,
  type PersistentMatcherEvent,
  type PersistentMatcherState,
} from "../../src/lib/persistent-matcher.ts";
import {
  hashLegacyMatcherControlForReplay,
  type MatcherSignatureVerifier,
  type ReplayOnlyLegacyMatcherControlAuthorization,
} from "../../src/lib/matcher-auth.ts";
import { normalizeHex32, UINT64_MAX, type Hex32 } from "../../src/lib/order-domain.ts";
import { activeAccountEpoch } from "../../src/lib/order-lifecycle.ts";
import type { SolverPricePolicy, SolverQuote } from "../../src/lib/solver-quotes.ts";
import { atomicWriteFile } from "../durable-file.ts";
import {
  JOURNAL_GENESIS_HASH,
  DEFAULT_MAX_JOURNAL_LINE_BYTES,
  DEFAULT_MAX_JOURNAL_RECORDS,
  DEFAULT_MAX_JOURNAL_BYTES,
  JOURNAL_VERSION,
  appendJournal,
  assertCheckpointInJournal,
  canonicalJournalJson,
  readJournal,
  readJournalCheckpoint,
  writeJournalCheckpoint,
  type JournalCheckpoint,
  type JournalRecord,
  type JournalState,
  type JournalValue,
} from "./journal.ts";

type SerializedObject = { [key: string]: JournalValue };
export type PersistentMatcherEventContext =
  | Readonly<{ source: "ingress" }>
  | Readonly<{
    source: "journal";
    sequence: bigint;
    legacyControlCutoverSequence: bigint;
  }>;

const CURRENT_INITIALIZATION_MARKER_VERSION = 2;
const INITIALIZING_MARKER_VERSION = 2;

type InitializationMarker = Readonly<{
  version: typeof CURRENT_INITIALIZATION_MARKER_VERSION;
  configurationHash: Hex32;
  legacyControlCutover: Readonly<{
    sequence: bigint;
    recordHash: Hex32;
    stateRoot: Hex32;
  }>;
}>;

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
  receiptCheckpoint: JournalCheckpoint;
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
    if (event.controlAuthorizationScheme !== undefined
      && event.controlAuthorizationScheme !== EIP712_MATCHER_CONTROL_AUTHORIZATION_SCHEME) {
      throw new Error("Only EIP-712 matcher controls may be persisted");
    }
    payload.orderHash = event.orderHash;
    payload.signature = event.signature;
    payload.controlAuthorizationScheme = EIP712_MATCHER_CONTROL_AUTHORIZATION_SCHEME;
  } else if (event.kind === "advance-epoch") {
    if (event.controlAuthorizationScheme !== undefined
      && event.controlAuthorizationScheme !== EIP712_MATCHER_CONTROL_AUTHORIZATION_SCHEME) {
      throw new Error("Only EIP-712 matcher controls may be persisted");
    }
    payload.makerAccountId = event.makerAccountId;
    payload.nextEpoch = event.nextEpoch.toString();
    payload.authorizedSignerId = event.authorizedSignerId;
    payload.signature = event.signature;
    payload.controlAuthorizationScheme = EIP712_MATCHER_CONTROL_AUTHORIZATION_SCHEME;
  } else if (event.kind === "accept-solver-quote") {
    payload.quote = serializedQuote(event.quote);
    payload.signature = event.signature;
  } else if (event.kind === "cancel-solver-quote") {
    payload.quoteHash = event.quoteHash;
    payload.signature = event.signature;
  } else {
    payload.legacyThroughSequence = event.legacyThroughSequence.toString();
    payload.legacyThroughRecordHash = event.legacyThroughRecordHash;
    payload.legacyThroughStateRoot = event.legacyThroughStateRoot;
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
  context: PersistentMatcherEventContext,
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
    const controlAuthorizationScheme = deserializeControlAuthorizationScheme(
      payload,
      ["version", "requestId", "occurredAtSeconds", "kind", "orderHash", "signature"],
      "Cancellation event payload",
      context,
    );
    return {
      ...common,
      kind,
      orderHash: hex32Value(payload.orderHash, "Cancelled order hash"),
      signature: stringValue(payload.signature, "Cancellation signature"),
      controlAuthorizationScheme,
    };
  }
  if (kind === "advance-epoch") {
    const controlAuthorizationScheme = deserializeControlAuthorizationScheme(
      payload,
      ["version", "requestId", "occurredAtSeconds", "kind", "makerAccountId", "nextEpoch", "authorizedSignerId", "signature"],
      "Epoch event payload",
      context,
    );
    return {
      ...common,
      kind,
      makerAccountId: hex32Value(payload.makerAccountId, "Maker account ID"),
      nextEpoch: bigintValue(payload.nextEpoch, "Next account epoch"),
      authorizedSignerId: hex32Value(payload.authorizedSignerId, "Authorized signer ID"),
      signature: stringValue(payload.signature, "Epoch signature"),
      controlAuthorizationScheme,
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
  if (kind === "control-authorization-cutover") {
    assertExactKeys(payload, [
      "version", "requestId", "occurredAtSeconds", "kind", "legacyThroughSequence",
      "legacyThroughRecordHash", "legacyThroughStateRoot",
    ], "Matcher control authorization cutover payload");
    return {
      ...common,
      kind,
      legacyThroughSequence: bigintValue(payload.legacyThroughSequence, "Legacy control cutover sequence"),
      legacyThroughRecordHash: hex32Value(payload.legacyThroughRecordHash, "Legacy control cutover record hash"),
      legacyThroughStateRoot: hex32Value(payload.legacyThroughStateRoot, "Legacy control cutover state root"),
    };
  }
  throw new Error("Matcher event kind is unsupported");
}

function deserializeControlAuthorizationScheme(
  payload: SerializedObject,
  fields: readonly string[],
  label: string,
  context: PersistentMatcherEventContext,
): MatcherControlAuthorizationScheme {
  if (context.source === "ingress") {
    assertExactKeys(payload, fields, label);
    return EIP712_MATCHER_CONTROL_AUTHORIZATION_SCHEME;
  }
  const hasMarker = Object.hasOwn(payload, "controlAuthorizationScheme");
  assertExactKeys(payload, hasMarker ? [...fields, "controlAuthorizationScheme"] : fields, label);
  if (!hasMarker) {
    if (context.sequence > context.legacyControlCutoverSequence) {
      throw new Error("Unmarked legacy matcher control is beyond the authorization cutover");
    }
    return LEGACY_RAW_MATCHER_CONTROL_AUTHORIZATION_SCHEME;
  }
  const scheme = stringValue(payload.controlAuthorizationScheme, "Matcher control authorization scheme");
  if (scheme !== EIP712_MATCHER_CONTROL_AUTHORIZATION_SCHEME) {
    throw new Error("Matcher control authorization scheme is unsupported");
  }
  return scheme;
}

function legacyInitializationMarker(configurationHash: Hex32): string {
  return `persistent-matcher-v1:${configurationHash}\n`;
}

function initializingMarker(configurationHash: Hex32): string {
  return `persistent-matcher-initializing-v${INITIALIZING_MARKER_VERSION}:${configurationHash}\n`;
}

function initializationMarkerBytes(marker: InitializationMarker): string {
  return `${canonicalJournalJson({
    version: marker.version,
    configurationHash: marker.configurationHash,
    legacyControlCutover: {
      sequence: marker.legacyControlCutover.sequence.toString(),
      recordHash: marker.legacyControlCutover.recordHash,
      stateRoot: marker.legacyControlCutover.stateRoot,
    },
  })}\n`;
}

function parseInitializationMarker(
  bytes: string,
  configurationHash: Hex32,
): InitializationMarker | "legacy-v1" | "initializing-v2" {
  if (bytes === legacyInitializationMarker(configurationHash)) return "legacy-v1";
  if (bytes === initializingMarker(configurationHash)) return "initializing-v2";
  if (!bytes.endsWith("\n")) throw new Error("Matcher initialization marker is not newline terminated");
  let parsed: JournalValue;
  try {
    parsed = JSON.parse(bytes) as JournalValue;
  } catch {
    throw new Error("Matcher initialization marker is not valid JSON");
  }
  const marker = objectValue(parsed, "Matcher initialization marker");
  assertExactKeys(marker, ["version", "configurationHash", "legacyControlCutover"], "Matcher initialization marker");
  if (integerValue(marker.version, "Matcher initialization marker version") !== CURRENT_INITIALIZATION_MARKER_VERSION) {
    throw new Error("Matcher initialization marker version is unsupported");
  }
  if (hex32Value(marker.configurationHash, "Matcher initialization configuration hash") !== configurationHash) {
    throw new Error("Matcher initialization marker does not match its configuration");
  }
  const cutover = objectValue(marker.legacyControlCutover, "Matcher legacy control cutover");
  assertExactKeys(cutover, ["sequence", "recordHash", "stateRoot"], "Matcher legacy control cutover");
  const parsedMarker: InitializationMarker = {
    version: CURRENT_INITIALIZATION_MARKER_VERSION,
    configurationHash,
    legacyControlCutover: {
      sequence: bigintValue(cutover.sequence, "Matcher legacy control cutover sequence"),
      recordHash: hex32Value(cutover.recordHash, "Matcher legacy control cutover record hash"),
      stateRoot: hex32Value(cutover.stateRoot, "Matcher legacy control cutover state root"),
    },
  };
  if (bytes !== initializationMarkerBytes(parsedMarker)) throw new Error("Matcher initialization marker is not canonical");
  return parsedMarker;
}

function assertInitializationMarkerInJournal(marker: InitializationMarker, journal: JournalState): void {
  const { sequence, recordHash } = marker.legacyControlCutover;
  if (sequence > journal.sequence) throw new Error("Matcher legacy control cutover is ahead of the journal");
  const expectedHash = sequence === 0n
    ? JOURNAL_GENESIS_HASH
    : journal.records[Number(sequence - 1n)]?.recordHash;
  if (!expectedHash || expectedHash !== recordHash) {
    throw new Error("Matcher legacy control cutover does not bind the corresponding journal record");
  }
}

type JournalControlAuthorizationCutover = Readonly<{
  record: JournalState["records"][number];
  event: Extract<PersistentMatcherEvent, { kind: "control-authorization-cutover" }>;
}>;

function findJournalControlAuthorizationCutover(
  configuration: PersistentMatcherConfiguration,
  journal: JournalState,
): JournalControlAuthorizationCutover | null {
  let found: JournalControlAuthorizationCutover | null = null;
  for (const record of journal.records) {
    const envelope = objectValue(record.event as SerializedObject, "Persisted matcher event");
    const payload = objectValue(envelope.payload, "Matcher event payload");
    if (payload.kind !== "control-authorization-cutover") continue;
    if (found) throw new Error("Matcher journal contains multiple control authorization cutovers");
    const sequence = BigInt(record.sequence);
    const event = deserializePersistentMatcherEvent(configuration, record.event, {
      source: "journal",
      sequence,
      legacyControlCutoverSequence: sequence - 1n,
    });
    if (event.kind !== "control-authorization-cutover") throw new Error("Matcher control authorization cutover kind is invalid");
    if (event.legacyThroughSequence !== sequence - 1n
      || event.legacyThroughRecordHash !== record.previousRecordHash) {
      throw new Error("Matcher control authorization cutover does not bind its prior journal prefix");
    }
    found = { record, event };
  }
  return found;
}

function journalRecordBytes(record: JournalState["records"][number]): number {
  return Buffer.byteLength(`${canonicalJournalJson(record)}\n`, "utf8");
}

function checkedCapacityAddition(value: number, reserve: number, label: string): number {
  const total = value + reserve;
  if (!Number.isSafeInteger(value) || value <= 0
    || !Number.isSafeInteger(reserve) || reserve <= 0
    || !Number.isSafeInteger(total)) {
    throw new RangeError(`${label} plus the system cutover reserve must be a positive safe integer`);
  }
  return total;
}

function assertUserJournalCapacity(
  journal: JournalState,
  cutover: JournalControlAuthorizationCutover | null,
  maximumRecords: number,
  maximumBytes: number,
): void {
  const cutoverBytes = cutover ? journalRecordBytes(cutover.record) : 0;
  const userRecords = journal.records.length - (cutover ? 1 : 0);
  const userBytes = journal.byteLength - cutoverBytes;
  if (userRecords > maximumRecords) throw new RangeError("Matcher user journal record limit exceeded");
  if (userBytes > maximumBytes) throw new RangeError("Matcher user journal byte limit exceeded");
}

function checkpointBytes(checkpoint: JournalCheckpoint): string {
  return `${canonicalJournalJson(checkpoint)}\n`;
}

async function assertExactInitializingPersistence(
  options: PersistentMatcherStoreOptions,
  journal: JournalState,
  checkpoint: JournalCheckpoint,
  cutover: JournalControlAuthorizationCutover | null,
  initial: PersistentMatcherState,
): Promise<void> {
  const journalBytes = await readFile(options.journalPath, "utf8");
  const observedCheckpointBytes = await readFile(options.checkpointPath, "utf8");
  const configurationHash = matcherConfigurationHash(options.configuration);
  const genesisCheckpoint: JournalCheckpoint = {
    version: JOURNAL_VERSION,
    sequence: "0",
    recordHash: JOURNAL_GENESIS_HASH,
    stateRoot: matcherStateRoot(initial),
    configurationHash,
  };
  if (journal.sequence === 0n) {
    if (journalBytes !== "" || observedCheckpointBytes !== checkpointBytes(genesisCheckpoint)) {
      throw new Error("Initializing matcher genesis persistence is not canonical");
    }
    return;
  }
  if (journal.sequence !== 1n || journal.records.length !== 1 || !cutover) {
    throw new Error("Initializing matcher journal contains unsupported records");
  }
  const expectedEvent: Extract<PersistentMatcherEvent, { kind: "control-authorization-cutover" }> = {
    version: 1,
    requestId: matcherControlAuthorizationCutoverRequestId(initial, JOURNAL_GENESIS_HASH),
    occurredAtSeconds: 0n,
    kind: "control-authorization-cutover",
    legacyThroughSequence: 0n,
    legacyThroughRecordHash: JOURNAL_GENESIS_HASH,
    legacyThroughStateRoot: matcherStateRoot(initial),
  };
  const record = journal.records[0];
  if (!record
    || journalBytes !== `${canonicalJournalJson(record)}\n`
    || canonicalJournalJson(record.event) !== canonicalJournalJson(serializePersistentMatcherEvent(options.configuration, expectedEvent))) {
    throw new Error("Initializing matcher cutover journal is not canonical");
  }
  const cutoverState = applyPersistentMatcherEvent(initial, expectedEvent, 1n, options.verifier).state;
  const cutoverCheckpoint: JournalCheckpoint = {
    version: JOURNAL_VERSION,
    sequence: "1",
    recordHash: record.recordHash,
    stateRoot: matcherStateRoot(cutoverState),
    configurationHash,
  };
  if (observedCheckpointBytes !== checkpointBytes(genesisCheckpoint)
    && observedCheckpointBytes !== checkpointBytes(cutoverCheckpoint)) {
    throw new Error("Initializing matcher cutover checkpoint is not canonical");
  }
  if (canonicalJournalJson(checkpoint) !== canonicalJournalJson(genesisCheckpoint)
    && canonicalJournalJson(checkpoint) !== canonicalJournalJson(cutoverCheckpoint)) {
    throw new Error("Initializing matcher cutover checkpoint is unsupported");
  }
}

function legacyJournalAuthorization(
  state: PersistentMatcherState,
  event: Extract<PersistentMatcherEvent, { kind: "cancel-order" | "advance-epoch" }>,
): ReplayOnlyLegacyMatcherControlAuthorization {
  if (event.kind === "cancel-order") {
    const orderHash = normalizeHex32(event.orderHash, "Cancelled order hash");
    const accepted = state.orderReference.acceptedOrders[orderHash];
    if (!accepted) throw new Error("Cancelled order is unknown");
    return {
      kind: "cancel-order",
      orderHash,
      makerAccountId: accepted.order.makerAccountId,
      accountEpoch: accepted.order.accountEpoch,
      nonce: accepted.order.nonce,
      authorizedSignerId: accepted.order.authorizedSignerId,
    };
  }
  const makerAccountId = normalizeHex32(event.makerAccountId, "Maker account ID");
  return {
    kind: "advance-epoch",
    makerAccountId,
    currentEpoch: activeAccountEpoch(state.orderReference.lifecycle, makerAccountId),
    nextEpoch: event.nextEpoch,
    authorizedSignerId: normalizeHex32(event.authorizedSignerId, "Authorized signer ID"),
  };
}

function applyPersistentMatcherJournalEvent(
  state: PersistentMatcherState,
  event: PersistentMatcherEvent,
  sequence: bigint,
  verifier: MatcherSignatureVerifier,
  legacyControlCutoverSequence: bigint,
): { state: PersistentMatcherState; receipt: MatcherMutationReceipt } {
  if ((event.kind !== "cancel-order" && event.kind !== "advance-epoch")
    || event.controlAuthorizationScheme !== LEGACY_RAW_MATCHER_CONTROL_AUTHORIZATION_SCHEME) {
    return applyPersistentMatcherEvent(state, event, sequence, verifier);
  }
  if (sequence > legacyControlCutoverSequence) {
    throw new Error("Legacy matcher control authorization is beyond the journal cutover");
  }
  const legacyDigest = hashLegacyMatcherControlForReplay(
    state.configuration.domain,
    legacyJournalAuthorization(state, event),
  );
  const replayVerifier: MatcherSignatureVerifier = {
    verify(_digest, signature, authorizedSignerId) {
      verifier.verify(legacyDigest, signature, authorizedSignerId);
    },
  };
  return applyPersistentMatcherEvent(state, {
    ...event,
    controlAuthorizationScheme: EIP712_MATCHER_CONTROL_AUTHORIZATION_SCHEME,
  }, sequence, replayVerifier);
}

function markerForJournalCutover(
  configurationHash: Hex32,
  cutover: JournalControlAuthorizationCutover,
  receiptCheckpoint: JournalCheckpoint,
): InitializationMarker {
  if (receiptCheckpoint.sequence !== cutover.record.sequence
    || receiptCheckpoint.recordHash !== cutover.record.recordHash) {
    throw new Error("Matcher control authorization cutover receipt checkpoint is invalid");
  }
  return {
    version: CURRENT_INITIALIZATION_MARKER_VERSION,
    configurationHash,
    legacyControlCutover: {
      sequence: BigInt(cutover.record.sequence),
      recordHash: cutover.record.recordHash,
      stateRoot: receiptCheckpoint.stateRoot,
    },
  };
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
  #records: JournalRecord[];
  #journal: JournalState;
  #state: PersistentMatcherState;
  #checkpoint: JournalCheckpoint;
  #receiptCheckpoints: ReadonlyMap<string, JournalCheckpoint>;
  #queue = Promise.resolve();
  #closed = false;
  #fault: MatcherPersistenceUnavailableError | null = null;
  #lockOwnership: WriterLockOwnership;
  #maximumPhysicalRecords: number;
  #maximumPhysicalBytes: number;

  private constructor(
    options: PersistentMatcherStoreOptions,
    journal: JournalState,
    state: PersistentMatcherState,
    checkpoint: JournalCheckpoint,
    receiptCheckpoints: ReadonlyMap<string, JournalCheckpoint>,
    lockOwnership: WriterLockOwnership,
    maximumPhysicalRecords: number,
    maximumPhysicalBytes: number,
  ) {
    this.#options = options;
    // One records array for the store's lifetime (ADR 0010, option C):
    // mutations push onto it instead of rebuilding it, so an append is
    // O(1) and the array the journal getter hands out is a live
    // reference. The replayed journal's array is copied once here so the
    // store owns the only reference to it.
    this.#records = [...journal.records];
    this.#journal = { ...journal, records: this.#records };
    this.#state = state;
    this.#checkpoint = checkpoint;
    this.#receiptCheckpoints = receiptCheckpoints;
    this.#lockOwnership = lockOwnership;
    this.#maximumPhysicalRecords = maximumPhysicalRecords;
    this.#maximumPhysicalBytes = maximumPhysicalBytes;
  }

  static async open(options: PersistentMatcherStoreOptions): Promise<PersistentMatcherStore> {
    const normalizedOptions: PersistentMatcherStoreOptions = {
      ...options,
      markerPath: options.markerPath ?? `${options.journalPath}.initialized`,
      lockPath: options.lockPath ?? `${options.journalPath}.lock`,
      maximumJournalRecords: options.maximumJournalRecords ?? DEFAULT_MAX_JOURNAL_RECORDS,
      maximumJournalLineBytes: options.maximumJournalLineBytes ?? DEFAULT_MAX_JOURNAL_LINE_BYTES,
      maximumJournalBytes: options.maximumJournalBytes ?? DEFAULT_MAX_JOURNAL_BYTES,
      clockSeconds: options.clockSeconds ?? defaultClockSeconds,
      maximumFutureEventSeconds: options.maximumFutureEventSeconds ?? DEFAULT_MAXIMUM_FUTURE_EVENT_SECONDS,
    };
    const markerPath = normalizedOptions.markerPath as string;
    const lockPath = normalizedOptions.lockPath as string;
    const maximumUserRecords = normalizedOptions.maximumJournalRecords as number;
    const maximumLineBytes = normalizedOptions.maximumJournalLineBytes as number;
    const maximumUserBytes = normalizedOptions.maximumJournalBytes as number;
    const maximumPhysicalRecords = checkedCapacityAddition(maximumUserRecords, 1, "Maximum matcher journal records");
    const maximumPhysicalReadBytes = checkedCapacityAddition(maximumUserBytes, maximumLineBytes, "Maximum matcher journal bytes");
    const configurationHash = matcherConfigurationHash(normalizedOptions.configuration);
    const lockOwnership = await acquireWriterLock(lockPath, configurationHash);
    try {
      const markerExists = await pathExists(markerPath);
      let journalExists = await pathExists(normalizedOptions.journalPath);
      let checkpointExists = await pathExists(normalizedOptions.checkpointPath);
      const initial = createPersistentMatcher(normalizedOptions.configuration);
      const genesisCheckpoint: JournalCheckpoint = {
        version: JOURNAL_VERSION,
        sequence: "0",
        recordHash: JOURNAL_GENESIS_HASH,
        stateRoot: matcherStateRoot(initial),
        configurationHash,
      };
      let initializationMarker: InitializationMarker | "legacy-v1" | "initializing-v2";
      if (!markerExists) {
        if (journalExists || checkpointExists) throw new Error("Uninitialized matcher has pre-existing persistence files");
        await atomicWriteFile(markerPath, initializingMarker(configurationHash));
        initializationMarker = "initializing-v2";
      } else {
        initializationMarker = parseInitializationMarker(await readFile(markerPath, "utf8"), configurationHash);
      }

      if (initializationMarker === "initializing-v2") {
        if (!journalExists && checkpointExists) {
          throw new Error("Initializing matcher checkpoint exists without its journal");
        }
        if (!journalExists) {
          await atomicWriteFile(normalizedOptions.journalPath, "");
          journalExists = true;
        }
        if (!checkpointExists) {
          const initializingJournal = await readJournal(normalizedOptions.journalPath, {
            maxRecords: maximumPhysicalRecords,
            maxLineBytes: maximumLineBytes,
            maxBytes: maximumPhysicalReadBytes,
          });
          if (initializingJournal.sequence !== 0n || initializingJournal.byteLength !== 0) {
            throw new Error("Initializing matcher journal is not empty before genesis checkpoint creation");
          }
          await writeJournalCheckpoint(normalizedOptions.checkpointPath, genesisCheckpoint);
          checkpointExists = true;
        }
      } else if (!journalExists || !checkpointExists) {
        throw new Error("Initialized matcher persistence is missing");
      }

      let journal = await readJournal(normalizedOptions.journalPath, {
        maxRecords: maximumPhysicalRecords,
        maxLineBytes: maximumLineBytes,
        maxBytes: maximumPhysicalReadBytes,
      });
      const checkpoint = await readJournalCheckpoint(normalizedOptions.checkpointPath);
      if (!checkpoint) throw new Error("Initialized matcher checkpoint is missing");
      if (checkpoint.configurationHash !== configurationHash) throw new Error("Matcher checkpoint configuration does not match");
      assertCheckpointInJournal(checkpoint, journal);
      let journalCutover = findJournalControlAuthorizationCutover(normalizedOptions.configuration, journal);
      assertUserJournalCapacity(journal, journalCutover, maximumUserRecords, maximumUserBytes);
      if (initializationMarker === "initializing-v2") {
        await assertExactInitializingPersistence(
          normalizedOptions,
          journal,
          checkpoint,
          journalCutover,
          initial,
        );
      }
      if (typeof initializationMarker !== "string") {
        assertInitializationMarkerInJournal(initializationMarker, journal);
        if (!journalCutover
          || initializationMarker.legacyControlCutover.sequence !== BigInt(journalCutover.record.sequence)
          || initializationMarker.legacyControlCutover.recordHash !== journalCutover.record.recordHash) {
          throw new Error("Matcher initialization marker does not bind the journal control authorization cutover");
        }
      }
      const legacyControlCutoverSequence = journalCutover?.event.legacyThroughSequence ?? journal.sequence;
      const checkpointSequence = BigInt(checkpoint.sequence);
      let state = initial;
      const receiptCheckpoints = new Map<string, JournalCheckpoint>();
      if (checkpointSequence === 0n && matcherStateRoot(state) !== checkpoint.stateRoot) {
        throw new Error("Matcher genesis checkpoint state root does not match replay");
      }
      const replayNow = trustedClock(normalizedOptions);
      const maximumFutureSeconds = maximumFutureEventSeconds(normalizedOptions);
      if (typeof initializationMarker !== "string"
        && initializationMarker.legacyControlCutover.sequence === 0n
        && matcherStateRoot(state) !== initializationMarker.legacyControlCutover.stateRoot) {
        throw new Error("Matcher legacy control cutover state root does not match replay");
      }
      for (const record of journal.records) {
        const sequence = BigInt(record.sequence);
        const event = deserializePersistentMatcherEvent(normalizedOptions.configuration, record.event, {
          source: "journal",
          sequence,
          legacyControlCutoverSequence,
        });
        assertMatcherEventTime(event, replayNow, maximumFutureSeconds);
        state = applyPersistentMatcherJournalEvent(
          state,
          event,
          sequence,
          normalizedOptions.verifier,
          legacyControlCutoverSequence,
        ).state;
        const receipt = state.receipts.at(-1);
        if (!receipt || receipt.sequence !== sequence) throw new Error("Matcher replay did not produce a contiguous receipt");
        receiptCheckpoints.set(receipt.requestId, {
          version: JOURNAL_VERSION,
          sequence: record.sequence,
          recordHash: record.recordHash,
          stateRoot: matcherStateRoot(state),
          configurationHash,
        });
        if (sequence === checkpointSequence && matcherStateRoot(state) !== checkpoint.stateRoot) {
          throw new Error("Matcher checkpoint state root does not match replay");
        }
        if (typeof initializationMarker !== "string"
          && sequence === initializationMarker.legacyControlCutover.sequence
          && matcherStateRoot(state) !== initializationMarker.legacyControlCutover.stateRoot) {
          throw new Error("Matcher legacy control cutover state root does not match replay");
        }
      }
      if (!journalCutover) {
        const cutoverEvent: Extract<PersistentMatcherEvent, { kind: "control-authorization-cutover" }> = {
          version: 1,
          requestId: matcherControlAuthorizationCutoverRequestId(state, journal.head),
          occurredAtSeconds: state.lastEventAtSeconds,
          kind: "control-authorization-cutover",
          legacyThroughSequence: journal.sequence,
          legacyThroughRecordHash: journal.head,
          legacyThroughStateRoot: matcherStateRoot(state),
        };
        const sequence = journal.sequence + 1n;
        const candidate = applyPersistentMatcherEvent(state, cutoverEvent, sequence, normalizedOptions.verifier);
        const record = await appendJournal(
          normalizedOptions.journalPath,
          journal,
          serializePersistentMatcherEvent(normalizedOptions.configuration, cutoverEvent),
          {
            maxRecords: maximumPhysicalRecords,
            maxLineBytes: maximumLineBytes,
            maxBytes: maximumPhysicalReadBytes,
          },
        );
        state = candidate.state;
        journal = {
          records: [...journal.records, record],
          sequence,
          head: record.recordHash,
          byteLength: journal.byteLength + Buffer.byteLength(`${canonicalJournalJson(record)}\n`, "utf8"),
        };
        const receiptCheckpoint: JournalCheckpoint = {
          version: JOURNAL_VERSION,
          sequence: record.sequence,
          recordHash: record.recordHash,
          stateRoot: matcherStateRoot(state),
          configurationHash,
        };
        receiptCheckpoints.set(cutoverEvent.requestId, receiptCheckpoint);
        journalCutover = { record, event: cutoverEvent };
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
      const cutoverCheckpoint = receiptCheckpoints.get(journalCutover.event.requestId);
      if (!cutoverCheckpoint) throw new Error("Matcher control authorization cutover checkpoint is unavailable");
      const expectedMarker = markerForJournalCutover(configurationHash, journalCutover, cutoverCheckpoint);
      if (typeof initializationMarker === "string") {
        await atomicWriteFile(markerPath, initializationMarkerBytes(expectedMarker));
      } else if (initializationMarkerBytes(initializationMarker) !== initializationMarkerBytes(expectedMarker)) {
        throw new Error("Matcher initialization marker does not match the journal control authorization cutover");
      }
      const maximumPhysicalBytes = checkedCapacityAddition(
        maximumUserBytes,
        journalRecordBytes(journalCutover.record),
        "Maximum matcher journal bytes",
      );
      return new PersistentMatcherStore(
        normalizedOptions,
        journal,
        state,
        currentCheckpoint,
        receiptCheckpoints,
        lockOwnership,
        maximumPhysicalRecords,
        maximumPhysicalBytes,
      );
    } catch (error) {
      await releaseWriterLock(lockPath, lockOwnership).catch(() => undefined);
      throw error;
    }
  }

  get state(): PersistentMatcherState {
    return this.#state;
  }

  get journal(): JournalState {
    // Live reference, not a snapshot (ADR 0010, option C): records is one
    // array for the store's lifetime and keeps growing as records are
    // appended, so read a record by index at time of use and do not hold
    // the array across a mutation expecting it to be stable. sequence,
    // head and byteLength are the values at the moment of the get.
    return this.#journal;
  }

  get checkpoint(): JournalCheckpoint {
    return this.#checkpoint;
  }

  receiptCheckpoint(requestId: string): JournalCheckpoint | null {
    return this.#receiptCheckpoints.get(requestId) ?? null;
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
    if (event.kind === "control-authorization-cutover") {
      throw new Error("Matcher control authorization cutover is system-managed");
    }
    if (
      (event.kind === "cancel-order" || event.kind === "advance-epoch")
      && event.controlAuthorizationScheme !== undefined
      && event.controlAuthorizationScheme !== EIP712_MATCHER_CONTROL_AUTHORIZATION_SCHEME
    ) {
      throw new Error("Legacy matcher control authorization is replay-only");
    }
    const nowSeconds = trustedClock(this.#options);
    const maximumFutureSeconds = maximumFutureEventSeconds(this.#options);
    assertMatcherEventTime(event, nowSeconds, maximumFutureSeconds);
    // occurredAtSeconds is transport input, not trusted time. Stamp new
    // mutations only after they reach the serialized mutation queue. An
    // existing request reuses its receipt timestamp so retries retain the
    // original command hash and deterministic replay bytes.
    const priorRequest = findRequestReceipt(this.#state, event.requestId);
    if (!priorRequest && event.requestId.startsWith(MATCHER_SYSTEM_REQUEST_ID_PREFIX)) {
      throw new Error("Matcher request ID uses a reserved system prefix");
    }
    const effectiveEvent: PersistentMatcherEvent = priorRequest
      ? { ...event, occurredAtSeconds: priorRequest.occurredAtSeconds }
      : { ...event, occurredAtSeconds: nowSeconds };
    const commandHash = matcherCommandHash(this.#options.configuration, effectiveEvent);
    const prior = findRequestReceipt(this.#state, effectiveEvent.requestId, commandHash);
    if (prior) {
      try {
        await this.#writeCheckpoint();
      } catch (error: unknown) {
        throw this.#markFault("checkpoint", error);
      }
      const receiptCheckpoint = this.#receiptCheckpoints.get(prior.requestId);
      if (!receiptCheckpoint) throw this.#markFault("receipt-checkpoint", new Error("Accepted matcher receipt checkpoint is unavailable"));
      return { receipt: prior, replayed: true, receiptCheckpoint, checkpoint: this.#checkpoint };
    }
    const sequence = this.#state.sequence + 1n;
    const candidate = applyPersistentMatcherEvent(this.#state, effectiveEvent, sequence, this.#options.verifier);
    let record;
    try {
      record = await appendJournal(
        this.#options.journalPath,
        this.#journal,
        serializePersistentMatcherEvent(this.#options.configuration, effectiveEvent),
        {
          maxRecords: this.#maximumPhysicalRecords,
          maxLineBytes: this.#options.maximumJournalLineBytes,
          maxBytes: this.#maximumPhysicalBytes,
        },
      );
      if (BigInt(record.sequence) !== sequence) throw new Error("Persisted journal sequence differs from the prepared matcher event");
    } catch (error: unknown) {
      throw this.#markFault("journal-append", error);
    }
    this.#state = candidate.state;
    this.#records.push(record);
    this.#journal = {
      records: this.#records,
      sequence,
      head: record.recordHash,
      byteLength: this.#journal.byteLength + Buffer.byteLength(`${canonicalJournalJson(record)}\n`, "utf8"),
    };
    try {
      await this.#writeCheckpoint();
    } catch (error: unknown) {
      throw this.#markFault("checkpoint", error);
    }
    const receiptCheckpoint = this.#checkpoint;
    this.#receiptCheckpoints = new Map(this.#receiptCheckpoints).set(candidate.receipt.requestId, receiptCheckpoint);
    return { receipt: candidate.receipt, replayed: false, receiptCheckpoint, checkpoint: this.#checkpoint };
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
