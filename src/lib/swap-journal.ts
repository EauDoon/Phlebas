import { UINT64_MAX, normalizeHex32, type Hex32 } from "./order-domain.ts";
import { sha256Hex } from "./sha256.ts";
import { swapStateRoot } from "./swap-root.ts";
import {
  authorizeSwapTerms,
  confirmSwapFunding,
  confirmSwapSpend,
  flagSwapDispute,
  observeSwapFunding,
  observeSwapSpend,
  prepareSwapFunding,
  retractSwapEvidence,
  type FundingEvidence,
  type SpendEvidence,
  type SwapDisputeReason,
  type SwapLeg,
  type SwapState,
} from "./swap-state.ts";

export const SWAP_EVENT_VERSION = 1 as const;
export const SWAP_EVENT_GENESIS = `0x${"00".repeat(32)}` as Hex32;

export type SwapEventPayload =
  | Readonly<{ kind: "authorize-terms"; partyId: Hex32; termsHash: Hex32; occurredAtSeconds: bigint }>
  | Readonly<{ kind: "prepare-funding"; leg: SwapLeg; artifactHash: Hex32; occurredAtSeconds: bigint }>
  | Readonly<{ kind: "observe-funding"; evidence: FundingEvidence }>
  | Readonly<{ kind: "confirm-funding"; leg: SwapLeg; factId: Hex32; qualifiedAtSeconds: bigint }>
  | Readonly<{ kind: "observe-spend"; evidence: SpendEvidence }>
  | Readonly<{ kind: "confirm-spend"; leg: SwapLeg; factId: Hex32; qualifiedAtSeconds: bigint }>
  | Readonly<{ kind: "flag-dispute"; reason: SwapDisputeReason; detail: string; evidenceId?: Hex32 }>
  | Readonly<{ kind: "retract-evidence"; evidenceId: Hex32; detail: string }>;

export type SwapEventReceipt = Readonly<{
  version: typeof SWAP_EVENT_VERSION;
  sequence: bigint;
  swapId: Hex32;
  termsHash: Hex32;
  previousEventHash: Hex32;
  priorStateRoot: Hex32;
  nextStateRoot: Hex32;
  payload: SwapEventPayload;
  payloadHash: Hex32;
  semanticSlot: string;
  eventHash: Hex32;
}>;

export type SwapJournal = Readonly<{
  swapId: Hex32;
  termsHash: Hex32;
  initialState: SwapState;
  initialStateRoot: Hex32;
  receipts: readonly SwapEventReceipt[];
  head: Hex32;
  nextSequence: bigint;
}>;

const EVENT_KEYS: Readonly<Record<SwapEventPayload["kind"], readonly string[]>> = Object.freeze({
  "authorize-terms": ["kind", "partyId", "termsHash", "occurredAtSeconds"],
  "prepare-funding": ["kind", "leg", "artifactHash", "occurredAtSeconds"],
  "observe-funding": ["kind", "evidence"],
  "confirm-funding": ["kind", "leg", "factId", "qualifiedAtSeconds"],
  "observe-spend": ["kind", "evidence"],
  "confirm-spend": ["kind", "leg", "factId", "qualifiedAtSeconds"],
  "flag-dispute": ["kind", "reason", "detail", "evidenceId"],
  "retract-evidence": ["kind", "evidenceId", "detail"],
});

function assertSwapEventPayload(payload: unknown): asserts payload is SwapEventPayload {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TypeError("Swap event payload must be an object");
  }
  const record = payload as Record<string, unknown>;
  if (typeof record.kind !== "string" || !Object.prototype.hasOwnProperty.call(EVENT_KEYS, record.kind)) {
    throw new TypeError("Unknown swap event kind");
  }
  const allowed = EVENT_KEYS[record.kind as SwapEventPayload["kind"]];
  const actual = Object.keys(record);
  if (actual.some((key) => !allowed.includes(key))) throw new TypeError("Swap event payload contains unknown fields");
  const required = record.kind === "flag-dispute" ? allowed.filter((key) => key !== "evidenceId") : allowed;
  if (required.some((key) => !Object.prototype.hasOwnProperty.call(record, key))) {
    throw new TypeError("Swap event payload is missing required fields");
  }
}

function canonicalHex32(value: string, label: string): Hex32 {
  const normalized = normalizeHex32(value, label);
  if (normalized !== value) throw new TypeError(`${label} must be canonical`);
  return normalized;
}

function canonicalValue(value: unknown): string {
  if (typeof value === "bigint") return `{"$bigint":"${value}"}`;
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "boolean" || value === null) return JSON.stringify(value);
  if (typeof value === "number") throw new TypeError("Journal payload numbers are forbidden; use bigint");
  if (Array.isArray(value)) return `[${value.map(canonicalValue).join(",")}]`;
  if (typeof value === "object" && value !== null) {
    return `{${Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalValue(entry)}`)
      .join(",")}}`;
  }
  throw new TypeError("Journal payload contains an unsupported value");
}

export function hashSwapEventPayload(payload: SwapEventPayload): Hex32 {
  assertSwapEventPayload(payload);
  return sha256Hex(`PhlebasSwapEventPayload\nversion=${SWAP_EVENT_VERSION}\npayload=${canonicalValue(payload)}`);
}

export function swapEventSemanticSlot(payload: SwapEventPayload): string {
  assertSwapEventPayload(payload);
  if (payload.kind === "authorize-terms") return `${payload.kind}:${payload.partyId}`;
  if (payload.kind === "prepare-funding") return `${payload.kind}:${payload.leg}`;
  if (payload.kind === "observe-funding") {
    const evidence = payload.evidence;
    return `${payload.kind}:${evidence.fact.leg}:${evidence.fact.factId}:${evidence.attestation.sourceId}`;
  }
  if (payload.kind === "confirm-funding" || payload.kind === "confirm-spend") {
    return `${payload.kind}:${payload.leg}:${payload.factId}`;
  }
  if (payload.kind === "observe-spend") {
    const evidence = payload.evidence;
    return `${payload.kind}:${evidence.fact.leg}:${evidence.fact.action}:${evidence.fact.factId}:${evidence.attestation.sourceId}`;
  }
  if (payload.kind === "retract-evidence") return `${payload.kind}:${payload.evidenceId}`;
  if (payload.kind === "flag-dispute") {
    return `${payload.kind}:${payload.reason}:${payload.evidenceId ?? "none"}:${payload.detail}`;
  }
  throw new TypeError("Unknown swap event kind");
}

export function hashSwapEvent(receipt: Omit<SwapEventReceipt, "eventHash">): Hex32 {
  if (typeof receipt.sequence !== "bigint" || receipt.sequence <= 0n || receipt.sequence > UINT64_MAX) {
    throw new RangeError("Swap event sequence must be a positive uint64");
  }
  return sha256Hex([
    "PhlebasSwapEvent",
    `version=${receipt.version}`,
    `sequence=${receipt.sequence}`,
    `swapId=${canonicalHex32(receipt.swapId, "Swap ID")}`,
    `termsHash=${canonicalHex32(receipt.termsHash, "Terms hash")}`,
    `previousEventHash=${canonicalHex32(receipt.previousEventHash, "Previous event hash")}`,
    `priorStateRoot=${canonicalHex32(receipt.priorStateRoot, "Prior state root")}`,
    `nextStateRoot=${canonicalHex32(receipt.nextStateRoot, "Next state root")}`,
    `payloadHash=${canonicalHex32(receipt.payloadHash, "Payload hash")}`,
    `semanticSlot=${receipt.semanticSlot}`,
  ].join("\n"));
}

export function emptySwapJournal(state: SwapState): SwapJournal {
  return Object.freeze({
    swapId: state.swapId,
    termsHash: state.termsHash,
    initialState: state,
    initialStateRoot: swapStateRoot(state),
    receipts: Object.freeze([]),
    head: SWAP_EVENT_GENESIS,
    nextSequence: 1n,
  });
}

export function applySwapEvent(state: SwapState, payload: SwapEventPayload): SwapState {
  assertSwapEventPayload(payload);
  if (payload.kind === "authorize-terms") {
    return authorizeSwapTerms(state, payload.partyId, payload.termsHash, payload.occurredAtSeconds);
  }
  if (payload.kind === "prepare-funding") {
    return prepareSwapFunding(state, payload.leg, payload.artifactHash, payload.occurredAtSeconds);
  }
  if (payload.kind === "observe-funding") return observeSwapFunding(state, payload.evidence);
  if (payload.kind === "confirm-funding") {
    return confirmSwapFunding(state, payload.leg, payload.factId, payload.qualifiedAtSeconds);
  }
  if (payload.kind === "observe-spend") return observeSwapSpend(state, payload.evidence);
  if (payload.kind === "confirm-spend") {
    return confirmSwapSpend(state, payload.leg, payload.factId, payload.qualifiedAtSeconds);
  }
  if (payload.kind === "retract-evidence") return retractSwapEvidence(state, payload.evidenceId, payload.detail);
  if (payload.kind === "flag-dispute") {
    return flagSwapDispute(state, payload.reason, payload.detail, payload.evidenceId);
  }
  throw new TypeError("Unknown swap event kind");
}

export function appendSwapEvent(
  journal: SwapJournal,
  state: SwapState,
  payload: SwapEventPayload,
): Readonly<{ journal: SwapJournal; state: SwapState; receipt: SwapEventReceipt; appended: boolean }> {
  if (!verifySwapJournal(journal)) throw new Error("Cannot append to an invalid swap journal");
  if (journal.swapId !== state.swapId || journal.termsHash !== state.termsHash) {
    throw new Error("Swap journal does not bind the supplied state");
  }
  const payloadHash = hashSwapEventPayload(payload);
  const duplicate = journal.receipts.find((receipt) => receipt.payloadHash === payloadHash);
  if (duplicate) return { journal, state, receipt: duplicate, appended: false };
  const semanticSlot = swapEventSemanticSlot(payload);
  const conflict = journal.receipts.find((receipt) => receipt.semanticSlot === semanticSlot);
  if (conflict) throw new Error("Conflicting event occupies the same semantic slot");

  const priorStateRoot = swapStateRoot(state);
  const expectedPriorRoot = journal.receipts.at(-1)?.nextStateRoot ?? journal.initialStateRoot;
  if (priorStateRoot !== expectedPriorRoot) throw new Error("Supplied swap state does not match the journal head");
  const nextState = applySwapEvent(state, payload);
  const nextStateRoot = swapStateRoot(nextState);
  const unsigned: Omit<SwapEventReceipt, "eventHash"> = Object.freeze({
    version: SWAP_EVENT_VERSION,
    sequence: journal.nextSequence,
    swapId: state.swapId,
    termsHash: state.termsHash,
    previousEventHash: journal.head,
    priorStateRoot,
    nextStateRoot,
    payload,
    payloadHash,
    semanticSlot,
  });
  const receipt: SwapEventReceipt = Object.freeze({ ...unsigned, eventHash: hashSwapEvent(unsigned) });
  return {
    state: nextState,
    receipt,
    appended: true,
    journal: Object.freeze({
      ...journal,
      receipts: Object.freeze([...journal.receipts, receipt]),
      head: receipt.eventHash,
      nextSequence: journal.nextSequence + 1n,
    }),
  };
}

export function verifySwapJournal(journal: SwapJournal): boolean {
  try {
    const swapId = canonicalHex32(journal.swapId, "Journal swap ID");
    const termsHash = canonicalHex32(journal.termsHash, "Journal terms hash");
    let stateRoot = canonicalHex32(journal.initialStateRoot, "Journal initial state root");
    if (journal.initialState.swapId !== swapId || journal.initialState.termsHash !== termsHash) return false;
    if (swapStateRoot(journal.initialState) !== stateRoot) return false;
    let state = journal.initialState;
    let previous = SWAP_EVENT_GENESIS;
    let sequence = 1n;
    const payloads = new Set<string>();
    const slots = new Set<string>();
    for (const receipt of journal.receipts) {
      assertSwapEventPayload(receipt.payload);
      if (receipt.version !== SWAP_EVENT_VERSION || receipt.sequence !== sequence) return false;
      if (receipt.swapId !== swapId || receipt.termsHash !== termsHash || receipt.previousEventHash !== previous) return false;
      if (receipt.priorStateRoot !== stateRoot) return false;
      if (receipt.payloadHash !== hashSwapEventPayload(receipt.payload)) return false;
      if (receipt.semanticSlot !== swapEventSemanticSlot(receipt.payload)) return false;
      if (payloads.has(receipt.payloadHash) || slots.has(receipt.semanticSlot)) return false;
      const unsigned: Omit<SwapEventReceipt, "eventHash"> = {
        version: receipt.version,
        sequence: receipt.sequence,
        swapId: receipt.swapId,
        termsHash: receipt.termsHash,
        previousEventHash: receipt.previousEventHash,
        priorStateRoot: receipt.priorStateRoot,
        nextStateRoot: receipt.nextStateRoot,
        payload: receipt.payload,
        payloadHash: receipt.payloadHash,
        semanticSlot: receipt.semanticSlot,
      };
      if (receipt.eventHash !== hashSwapEvent(unsigned)) return false;
      state = applySwapEvent(state, receipt.payload);
      if (swapStateRoot(state) !== receipt.nextStateRoot) return false;
      payloads.add(receipt.payloadHash);
      slots.add(receipt.semanticSlot);
      previous = receipt.eventHash;
      stateRoot = canonicalHex32(receipt.nextStateRoot, "Receipt next state root");
      sequence += 1n;
    }
    return journal.head === previous && journal.nextSequence === sequence && swapStateRoot(state) === stateRoot;
  } catch {
    return false;
  }
}
