import { UINT64_MAX, normalizeHex32, type Hex32 } from "./order-domain.ts";
import {
  assertApprovedSwapMarket,
  hashSwapTerms,
  roleForParty,
  swapIdForTerms,
  type SwapMarketPolicyV1,
  type SwapRole,
  type SwapTermsV1,
} from "./swap-domain.ts";
import {
  assertSwapEvidencePolicies,
  assertSwapTimingPolicy,
  type SwapEvidencePolicies,
  type SwapTimingPolicy,
} from "./swap-policy.ts";
import { hexToBytes } from "./keccak.ts";
import { sha256Hex } from "./sha256.ts";

export type SwapLeg = "zec" | "evm";
export type SwapLegPhase =
  | "unfunded"
  | "funding-prepared"
  | "funding-seen"
  | "funded-confirmed"
  | "claim-seen"
  | "claimed-confirmed"
  | "refund-seen"
  | "refunded-confirmed";
export type SwapPhase =
  | "disputed"
  | "awaiting-authorizations"
  | "awaiting-zec-funding"
  | "awaiting-zec-confirmation"
  | "awaiting-evm-funding"
  | "awaiting-evm-confirmation"
  | "awaiting-evm-claim"
  | "secret-observed"
  | "awaiting-zec-claim"
  | "settled"
  | "refund-recovery"
  | "refunded"
  | "expired";

export type FundingFact = Readonly<{
  factId: Hex32;
  leg: SwapLeg;
  swapId: Hex32;
  termsHash: Hex32;
  transactionId: Hex32;
  blockHash: Hex32;
  blockHeight: bigint;
  executedAtSeconds: bigint;
  outputIndex: bigint;
  chain: string;
  asset: string;
  amountAtoms: bigint;
  lockIdentity: string;
  escrowRecordId: Hex32;
  funder: string;
  claimRecipient: string;
  refundRecipient: string;
  secretHash: Hex32;
  refundTime: bigint;
  successful: boolean;
}>;

export type SpendFact = Readonly<{
  factId: Hex32;
  fundingFactId: Hex32;
  fundingTransactionId: Hex32;
  fundingOutputIndex: bigint;
  leg: SwapLeg;
  action: "claim" | "refund";
  swapId: Hex32;
  termsHash: Hex32;
  transactionId: Hex32;
  blockHash: Hex32;
  blockHeight: bigint;
  executedAtSeconds: bigint;
  inputOrLogIndex: bigint;
  chain: string;
  asset: string;
  amountAtoms: bigint;
  lockIdentity: string;
  escrowRecordId: Hex32;
  recipient: string;
  successful: boolean;
  preimage?: `0x${string}`;
}>;

export type ObserverAttestation = Readonly<{
  evidenceId: Hex32;
  factId: Hex32;
  sourceId: Hex32;
  observerPolicyId: Hex32;
  finalityPolicyId: Hex32;
  observedAtSeconds: bigint;
  tipBlockHash: Hex32;
  tipBlockHeight: bigint;
}>;

export type FundingEvidence = Readonly<{ fact: FundingFact; attestation: ObserverAttestation }>;
export type SpendEvidence = Readonly<{ fact: SpendFact; attestation: ObserverAttestation }>;

export type SwapLegState = Readonly<{
  phase: SwapLegPhase;
  fundingArtifactHash?: Hex32;
  fundingPreparedAtSeconds?: bigint;
  funding?: FundingFact;
  fundingAttestations?: readonly ObserverAttestation[];
  fundingConfirmedAtSeconds?: bigint;
  spend?: SpendFact;
  spendAttestations?: readonly ObserverAttestation[];
  spendConfirmedAtSeconds?: bigint;
}>;

export type SwapState = Readonly<{
  terms: SwapTermsV1;
  termsHash: Hex32;
  swapId: Hex32;
  timingPolicy: SwapTimingPolicy;
  marketPolicy: SwapMarketPolicyV1;
  evidencePolicies: SwapEvidencePolicies;
  authorizations: Readonly<Partial<Record<SwapRole, bigint>>>;
  zec: SwapLegState;
  evm: SwapLegState;
  observedSecret?: `0x${string}`;
  observedSecretFactId?: Hex32;
  confirmedSecret?: `0x${string}`;
  confirmedSecretFactId?: Hex32;
  terminal?: Readonly<{ kind: "expired"; occurredAtSeconds: bigint; reason: string }>;
  disputes: readonly SwapDispute[];
  resolutions: readonly SwapEvidenceResolution[];
  retractedEvidenceIds: Readonly<Record<string, true>>;
}>;

export type SwapDisputeReason = "observer-conflict" | "observer-stale" | "reorganization" | "semantic-mismatch";

export type SwapDispute = Readonly<{
  reason: SwapDisputeReason;
  evidenceId?: Hex32;
  detail: string;
}>;

export type SwapEvidenceResolution = Readonly<{
  resolutionId: Hex32;
  leg: SwapLeg;
  evidenceKind: "funding" | "spend";
  factId: Hex32;
  retractedEvidenceId: Hex32;
  retractedSourceId: Hex32;
  retractedAttestation: ObserverAttestation;
  replacementEvidenceId: Hex32;
  replacementSourceId: Hex32;
  replacementAttestation: ObserverAttestation;
  occurredAtSeconds: bigint;
  detail: string;
}>;

const EMPTY_LEG: SwapLegState = Object.freeze({ phase: "unfunded" });
const SWAP_LEG_PHASES = new Set<SwapLegPhase>([
  "unfunded",
  "funding-prepared",
  "funding-seen",
  "funded-confirmed",
  "claim-seen",
  "claimed-confirmed",
  "refund-seen",
  "refunded-confirmed",
]);
const SWAP_DISPUTE_REASONS = new Set<SwapDisputeReason>([
  "observer-conflict",
  "observer-stale",
  "reorganization",
  "semantic-mismatch",
]);
const SWAP_LEG_STATE_KEYS = new Set([
  "phase",
  "fundingArtifactHash",
  "fundingPreparedAtSeconds",
  "funding",
  "fundingAttestations",
  "fundingConfirmedAtSeconds",
  "spend",
  "spendAttestations",
  "spendConfirmedAtSeconds",
]);
const SWAP_STATE_KEYS = new Set([
  "terms",
  "termsHash",
  "swapId",
  "timingPolicy",
  "marketPolicy",
  "evidencePolicies",
  "authorizations",
  "zec",
  "evm",
  "observedSecret",
  "observedSecretFactId",
  "confirmedSecret",
  "confirmedSecretFactId",
  "terminal",
  "disputes",
  "resolutions",
  "retractedEvidenceIds",
]);
const FUNDING_FACT_KEYS = new Set([
  "factId", "leg", "swapId", "termsHash", "transactionId", "blockHash", "blockHeight", "executedAtSeconds",
  "outputIndex", "chain", "asset", "amountAtoms", "lockIdentity", "escrowRecordId", "funder", "claimRecipient",
  "refundRecipient", "secretHash", "refundTime", "successful",
]);
const SPEND_FACT_KEYS = new Set([
  "factId", "fundingFactId", "fundingTransactionId", "fundingOutputIndex", "leg", "action", "swapId", "termsHash",
  "transactionId", "blockHash", "blockHeight", "executedAtSeconds", "inputOrLogIndex", "chain", "asset", "amountAtoms",
  "lockIdentity", "escrowRecordId", "recipient", "successful", "preimage",
]);
const ATTESTATION_KEYS = new Set([
  "evidenceId", "factId", "sourceId", "observerPolicyId", "finalityPolicyId", "observedAtSeconds", "tipBlockHash",
  "tipBlockHeight",
]);
const DISPUTE_KEYS = new Set(["reason", "evidenceId", "detail"]);
const RESOLUTION_KEYS = new Set([
  "resolutionId", "leg", "evidenceKind", "factId", "retractedEvidenceId", "retractedSourceId",
  "retractedAttestation", "replacementEvidenceId", "replacementSourceId", "replacementAttestation",
  "occurredAtSeconds", "detail",
]);

function uint64(value: bigint, label: string, allowZero = true): bigint {
  if (typeof value !== "bigint") throw new TypeError(`${label} must be a bigint`);
  if (value < (allowZero ? 0n : 1n) || value > UINT64_MAX) throw new RangeError(`${label} must fit uint64`);
  return value;
}

function canonicalHex32(value: string, label: string): Hex32 {
  const normalized = normalizeHex32(value, label);
  if (normalized !== value) throw new TypeError(`${label} must be canonical`);
  if (normalized === `0x${"00".repeat(32)}`) throw new TypeError(`${label} cannot be zero`);
  return normalized;
}

function assertExactObjectFields(value: unknown, allowed: ReadonlySet<string>, label: string): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new TypeError(`${label} must be a plain canonical object`);
  const keys = Object.keys(value);
  if (keys.some((key) => !allowed.has(key))) throw new TypeError(`${label} contains unknown fields`);
  if (keys.some((key) => (value as Readonly<Record<string, unknown>>)[key] === undefined)) {
    throw new TypeError(`${label} cannot contain undefined fields`);
  }
}

function observerAttestations(state: SwapState): readonly ObserverAttestation[] {
  return [
    ...(state.zec.fundingAttestations ?? []),
    ...(state.zec.spendAttestations ?? []),
    ...(state.evm.fundingAttestations ?? []),
    ...(state.evm.spendAttestations ?? []),
  ];
}

function hasObserverAttestation(state: SwapState, evidenceId: Hex32): boolean {
  return observerAttestations(state).some((attestation) => attestation.evidenceId === evidenceId);
}

function assertUniqueAttestations(attestations: readonly ObserverAttestation[], label: string): void {
  const evidenceIds = new Set<string>();
  const sourceIds = new Set<string>();
  for (const attestation of attestations) {
    if (evidenceIds.has(attestation.evidenceId)) throw new Error(`${label} evidence IDs must be unique`);
    if (sourceIds.has(attestation.sourceId)) throw new Error(`${label} observer sources must be unique`);
    evidenceIds.add(attestation.evidenceId);
    sourceIds.add(attestation.sourceId);
  }
}

function attestationsEqual(left: ObserverAttestation, right: ObserverAttestation): boolean {
  return [...ATTESTATION_KEYS].every((key) => (
    left[key as keyof ObserverAttestation] === right[key as keyof ObserverAttestation]
  ));
}

function assertSwapLegStateIntegrity(state: SwapState, leg: SwapLeg): void {
  const current = state[leg];
  assertExactObjectFields(current, SWAP_LEG_STATE_KEYS, `${leg.toUpperCase()} leg`);
  if (!SWAP_LEG_PHASES.has(current.phase)) throw new TypeError(`${leg.toUpperCase()} leg has an unknown phase`);

  const fundingRequired = !["unfunded", "funding-prepared"].includes(current.phase);
  const fundingConfirmed = ["funded-confirmed", "claim-seen", "claimed-confirmed", "refund-seen", "refunded-confirmed"]
    .includes(current.phase);
  const spendRequired = ["claim-seen", "claimed-confirmed", "refund-seen", "refunded-confirmed"].includes(current.phase);
  const spendConfirmed = ["claimed-confirmed", "refunded-confirmed"].includes(current.phase);
  const artifactRequired = current.phase !== "unfunded";

  if (artifactRequired) {
    canonicalHex32(current.fundingArtifactHash as string, `${leg.toUpperCase()} funding artifact hash`);
    uint64(current.fundingPreparedAtSeconds as bigint, `${leg.toUpperCase()} funding preparation time`);
  } else if (current.fundingArtifactHash !== undefined || current.fundingPreparedAtSeconds !== undefined) {
    throw new Error(`${leg.toUpperCase()} unfunded leg cannot retain a funding artifact`);
  }

  if (fundingRequired) {
    if (!current.funding || !Array.isArray(current.fundingAttestations) || current.fundingAttestations.length === 0) {
      throw new Error(`${leg.toUpperCase()} ${current.phase} phase requires funding fact and attestations`);
    }
    if (current.funding.leg !== leg) throw new Error(`${leg.toUpperCase()} leg cannot retain another leg's funding fact`);
    assertExactObjectFields(current.funding, FUNDING_FACT_KEYS, `${leg.toUpperCase()} funding fact`);
    assertUniqueAttestations(current.fundingAttestations, `${leg.toUpperCase()} funding`);
    for (const attestation of current.fundingAttestations) {
      assertExactObjectFields(attestation, ATTESTATION_KEYS, `${leg.toUpperCase()} funding attestation`);
      validateFundingEvidence(state, { fact: current.funding, attestation });
    }
  } else if (current.funding !== undefined || current.fundingAttestations !== undefined) {
    throw new Error(`${leg.toUpperCase()} ${current.phase} phase cannot retain funding evidence`);
  }

  if (fundingConfirmed) {
    if (current.fundingConfirmedAtSeconds === undefined || !current.funding) {
      throw new Error(`${leg.toUpperCase()} ${current.phase} phase requires funding confirmation`);
    }
    assertPolicyQualified(state, leg, current.funding, current.fundingAttestations, current.fundingConfirmedAtSeconds);
  } else if (current.fundingConfirmedAtSeconds !== undefined) {
    throw new Error(`${leg.toUpperCase()} ${current.phase} phase cannot retain funding confirmation`);
  }

  if (spendRequired) {
    if (!current.spend || !Array.isArray(current.spendAttestations) || current.spendAttestations.length === 0) {
      throw new Error(`${leg.toUpperCase()} ${current.phase} phase requires spend fact and attestations`);
    }
    if (current.spend.leg !== leg) throw new Error(`${leg.toUpperCase()} leg cannot retain another leg's spend fact`);
    assertExactObjectFields(current.spend, SPEND_FACT_KEYS, `${leg.toUpperCase()} spend fact`);
    const expectedAction = current.phase.startsWith("claim") ? "claim" : "refund";
    if (current.spend.action !== expectedAction) throw new Error(`${leg.toUpperCase()} spend action does not match its phase`);
    assertUniqueAttestations(current.spendAttestations, `${leg.toUpperCase()} spend`);
    for (const attestation of current.spendAttestations) {
      assertExactObjectFields(attestation, ATTESTATION_KEYS, `${leg.toUpperCase()} spend attestation`);
      validateSpendEvidence(state, { fact: current.spend, attestation });
    }
  } else if (current.spend !== undefined || current.spendAttestations !== undefined) {
    throw new Error(`${leg.toUpperCase()} ${current.phase} phase cannot retain spend evidence`);
  }

  if (spendConfirmed) {
    if (current.spendConfirmedAtSeconds === undefined || !current.spend) {
      throw new Error(`${leg.toUpperCase()} ${current.phase} phase requires spend confirmation`);
    }
    assertPolicyQualified(state, leg, current.spend, current.spendAttestations, current.spendConfirmedAtSeconds);
  } else if (current.spendConfirmedAtSeconds !== undefined) {
    throw new Error(`${leg.toUpperCase()} ${current.phase} phase cannot retain spend confirmation`);
  }
}

function assertResolutionGraphAcyclic(resolutions: readonly SwapEvidenceResolution[]): void {
  const nextByRetracted = new Map<Hex32, Hex32>(
    resolutions.map((resolution) => [resolution.retractedEvidenceId, resolution.replacementEvidenceId]),
  );
  for (const start of nextByRetracted.keys()) {
    const visited = new Set<Hex32>();
    let current: Hex32 | undefined = start;
    while (current && nextByRetracted.has(current)) {
      if (visited.has(current)) throw new Error("Evidence replacement resolutions cannot contain a cycle");
      visited.add(current);
      current = nextByRetracted.get(current);
    }
  }
}

export function fundingFactId(fact: Omit<FundingFact, "factId">): Hex32 {
  return sha256Hex([
    "PhlebasSwapFundingFact",
    "version=1",
    `leg=${fact.leg}`,
    `swapId=${fact.swapId}`,
    `termsHash=${fact.termsHash}`,
    `transactionId=${fact.transactionId}`,
    `blockHash=${fact.blockHash}`,
    `blockHeight=${fact.blockHeight}`,
    `executedAtSeconds=${fact.executedAtSeconds}`,
    `outputIndex=${fact.outputIndex}`,
    `chain=${fact.chain}`,
    `asset=${fact.asset}`,
    `amountAtoms=${fact.amountAtoms}`,
    `lockIdentity=${fact.lockIdentity}`,
    `escrowRecordId=${fact.escrowRecordId}`,
    `funder=${fact.funder}`,
    `claimRecipient=${fact.claimRecipient}`,
    `refundRecipient=${fact.refundRecipient}`,
    `secretHash=${fact.secretHash}`,
    `refundTime=${fact.refundTime}`,
    `successful=${fact.successful}`,
  ].join("\n"));
}

export function spendFactId(fact: Omit<SpendFact, "factId">): Hex32 {
  return sha256Hex([
    "PhlebasSwapSpendFact",
    "version=1",
    `fundingFactId=${fact.fundingFactId}`,
    `fundingTransactionId=${fact.fundingTransactionId}`,
    `fundingOutputIndex=${fact.fundingOutputIndex}`,
    `leg=${fact.leg}`,
    `action=${fact.action}`,
    `swapId=${fact.swapId}`,
    `termsHash=${fact.termsHash}`,
    `transactionId=${fact.transactionId}`,
    `blockHash=${fact.blockHash}`,
    `blockHeight=${fact.blockHeight}`,
    `executedAtSeconds=${fact.executedAtSeconds}`,
    `inputOrLogIndex=${fact.inputOrLogIndex}`,
    `chain=${fact.chain}`,
    `asset=${fact.asset}`,
    `amountAtoms=${fact.amountAtoms}`,
    `lockIdentity=${fact.lockIdentity}`,
    `escrowRecordId=${fact.escrowRecordId}`,
    `recipient=${fact.recipient}`,
    `successful=${fact.successful}`,
    `preimage=${fact.preimage ?? "none"}`,
  ].join("\n"));
}

function allAuthorized(state: SwapState): boolean {
  return Object.hasOwn(state.authorizations, "zec-seller")
    && Object.hasOwn(state.authorizations, "stablecoin-seller")
    && typeof state.authorizations["zec-seller"] === "bigint"
    && typeof state.authorizations["stablecoin-seller"] === "bigint";
}

function isRetracted(state: SwapState, evidenceId: string): boolean {
  return Object.hasOwn(state.retractedEvidenceIds, evidenceId) && state.retractedEvidenceIds[evidenceId] === true;
}

function latestAuthorizationTime(state: SwapState): bigint {
  if (!allAuthorized(state)) throw new Error("Both parties have not authorized exact swap terms");
  const zec = state.authorizations["zec-seller"] as bigint;
  const stablecoin = state.authorizations["stablecoin-seller"] as bigint;
  return zec > stablecoin ? zec : stablecoin;
}

function assertNotDisputed(state: SwapState): void {
  assertSwapStateIntegrity(state);
  if (state.terminal) throw new Error("Swap is terminal; no further transitions are allowed");
  if (state.disputes.length > 0) throw new Error("Swap is disputed; funding and claim actions are disabled");
}

export function assertSwapStateIntegrity(state: SwapState): SwapState {
  assertExactObjectFields(state, SWAP_STATE_KEYS, "Swap state");
  const validated = assertSwapTimingPolicy(state.terms, state.timingPolicy);
  assertApprovedSwapMarket(validated, state.marketPolicy);
  assertSwapEvidencePolicies(validated, state.evidencePolicies);
  if (hashSwapTerms(validated) !== state.termsHash) throw new Error("Swap state terms do not match the signed terms hash");
  if (swapIdForTerms(validated) !== state.swapId) throw new Error("Swap state terms do not match the swap ID");
  if (!state.authorizations || typeof state.authorizations !== "object" || Array.isArray(state.authorizations)) {
    throw new TypeError("Swap authorizations must use a canonical record");
  }
  if (Object.getPrototypeOf(state.authorizations) !== Object.prototype) {
    throw new TypeError("Swap authorizations must use a plain canonical record");
  }
  for (const [role, authorized] of Object.entries(state.authorizations)) {
    if (role !== "zec-seller" && role !== "stablecoin-seller") {
      throw new TypeError("Swap authorizations may contain only exact participant roles");
    }
    const authorizedAt = uint64(authorized, `${role} authorization time`);
    if (authorizedAt >= state.terms.authorizationDeadline) throw new Error("Persisted authorization occurred after its signed deadline");
  }
  if (!Array.isArray(state.disputes) || !Array.isArray(state.resolutions)) {
    throw new TypeError("Swap recovery metadata must use canonical arrays");
  }
  if (!state.retractedEvidenceIds || typeof state.retractedEvidenceIds !== "object" || Array.isArray(state.retractedEvidenceIds)) {
    throw new TypeError("Retracted evidence IDs must use a canonical record");
  }
  if (Object.getPrototypeOf(state.retractedEvidenceIds) !== Object.prototype) {
    throw new TypeError("Retracted evidence IDs must use a plain canonical record");
  }
  for (const [evidenceId, retracted] of Object.entries(state.retractedEvidenceIds)) {
    canonicalHex32(evidenceId, "Retracted evidence ID");
    if (retracted !== true) throw new TypeError("Retracted evidence records must contain true values");
  }

  assertSwapLegStateIntegrity(state, "zec");
  assertSwapLegStateIntegrity(state, "evm");
  const progressed = state.zec.phase !== "unfunded" || state.evm.phase !== "unfunded";
  if (progressed && !allAuthorized(state)) throw new Error("Persisted swap progression requires both exact terms authorizations");
  if (progressed) {
    const authorizedAt = latestAuthorizationTime(state);
    for (const leg of ["zec", "evm"] as const) {
      const current = state[leg];
      if (current.phase === "unfunded") continue;
      const preparedAt = current.fundingPreparedAtSeconds as bigint;
      if (preparedAt < authorizedAt) {
        throw new Error(`${leg.toUpperCase()} funding preparation cannot predate exact terms authorization`);
      }
      if (leg === "zec") {
        if (preparedAt >= state.terms.zecFundBy) throw new Error("Persisted ZEC funding preparation missed its signed cutoff");
      } else {
        if (preparedAt > state.terms.evmFundBy || preparedAt >= state.terms.evmClaimSafetyCutoff) {
          throw new Error("Persisted EVM funding preparation missed its safe signed window");
        }
        if (state.zec.fundingConfirmedAtSeconds === undefined
          || preparedAt < state.zec.fundingConfirmedAtSeconds) {
          throw new Error("Persisted EVM funding preparation cannot predate policy-confirmed ZEC funding");
        }
      }
    }
  }
  if (state.evm.phase !== "unfunded" && ![
    "funded-confirmed", "claim-seen", "claimed-confirmed", "refund-seen", "refunded-confirmed",
  ].includes(state.zec.phase)) {
    throw new Error("Persisted EVM progression requires policy-confirmed ZEC funding");
  }
  if ((state.zec.phase === "claim-seen" || state.zec.phase === "claimed-confirmed")
    && state.evm.phase !== "claimed-confirmed") {
    throw new Error("Persisted ZEC claim progression requires a policy-confirmed EVM claim");
  }

  const attestations = observerAttestations(state);
  const globalAttestationIds = new Set<string>();
  for (const attestation of attestations) {
    if (globalAttestationIds.has(attestation.evidenceId)) throw new Error("Observer evidence IDs must be globally unique");
    globalAttestationIds.add(attestation.evidenceId);
  }

  const disputeKeys = new Set<string>();
  for (const dispute of state.disputes) {
    assertExactObjectFields(dispute, DISPUTE_KEYS, "Swap dispute");
    if (!SWAP_DISPUTE_REASONS.has(dispute.reason)) throw new TypeError("Swap dispute reason is not recognized");
    canonicalDetail(dispute.detail, "Dispute detail");
    const evidenceId = dispute.evidenceId === undefined
      ? undefined
      : canonicalHex32(dispute.evidenceId, "Disputed evidence ID");
    if (dispute.reason === "reorganization") {
      if (!evidenceId || !isRetracted(state, evidenceId) || !hasObserverAttestation(state, evidenceId)) {
        throw new Error("Reorganization disputes must reference an active retracted observer attestation");
      }
    } else if (evidenceId && !hasEvidence(state, evidenceId)) {
      throw new Error("Swap dispute references unknown evidence");
    }
    const key = `${dispute.reason}:${evidenceId ?? "none"}:${dispute.detail}`;
    if (disputeKeys.has(key)) throw new Error("Swap disputes must be unique");
    disputeKeys.add(key);
  }

  for (const [label, collection, confirmed] of [
    ["ZEC funding", state.zec.fundingAttestations, state.zec.fundingConfirmedAtSeconds !== undefined],
    ["ZEC spend", state.zec.spendAttestations, state.zec.spendConfirmedAtSeconds !== undefined],
    ["EVM funding", state.evm.fundingAttestations, state.evm.fundingConfirmedAtSeconds !== undefined],
    ["EVM spend", state.evm.spendAttestations, state.evm.spendConfirmedAtSeconds !== undefined],
  ] as const) {
    const reports = collection ?? [];
    const views = new Set(reports.map((attestation) => `${attestation.tipBlockHeight}:${attestation.tipBlockHash}`));
    if (views.size > 1) {
      if (confirmed) throw new Error(`${label} confirmation cannot retain conflicting observer chain views`);
      const ids = new Set(reports.map((attestation) => attestation.evidenceId));
      if (!state.disputes.some((dispute) => dispute.reason === "observer-conflict" && dispute.evidenceId && ids.has(dispute.evidenceId))) {
        throw new Error(`${label} observer chain-view disagreement must remain disputed`);
      }
    }
  }

  const resolutionIds = new Set<string>();
  const resolvedRetractions = new Set<string>();
  const replacementIds = new Set<string>();
  for (const resolution of state.resolutions) {
    assertExactObjectFields(resolution, RESOLUTION_KEYS, "Evidence resolution");
    const resolutionId = canonicalHex32(resolution.resolutionId, "Resolution ID");
    if (resolution.leg !== "zec" && resolution.leg !== "evm") throw new TypeError("Resolution leg is not recognized");
    if (resolution.evidenceKind !== "funding" && resolution.evidenceKind !== "spend") {
      throw new TypeError("Resolution evidence kind is not recognized");
    }
    canonicalHex32(resolution.factId, "Resolved fact ID");
    const retractedEvidenceId = canonicalHex32(resolution.retractedEvidenceId, "Resolved evidence ID");
    const retractedSourceId = canonicalHex32(resolution.retractedSourceId, "Retracted observer source ID");
    const replacementEvidenceId = canonicalHex32(resolution.replacementEvidenceId, "Replacement evidence ID");
    const replacementSourceId = canonicalHex32(resolution.replacementSourceId, "Replacement observer source ID");
    assertExactObjectFields(resolution.retractedAttestation, ATTESTATION_KEYS, "Retracted observer attestation");
    assertExactObjectFields(resolution.replacementAttestation, ATTESTATION_KEYS, "Replacement observer attestation");
    if (resolution.retractedAttestation.evidenceId !== retractedEvidenceId
      || resolution.retractedAttestation.sourceId !== retractedSourceId
      || resolution.retractedAttestation.factId !== resolution.factId) {
      throw new Error("Resolution retracted attestation does not bind its recorded evidence, fact, and observer source");
    }
    if (resolution.replacementAttestation.evidenceId !== replacementEvidenceId
      || resolution.replacementAttestation.sourceId !== replacementSourceId
      || resolution.replacementAttestation.factId !== resolution.factId) {
      throw new Error("Resolution replacement attestation does not bind its recorded evidence, fact, and observer source");
    }
    if (resolutionIds.has(resolutionId)) throw new Error("Resolution IDs must be unique");
    if (resolvedRetractions.has(retractedEvidenceId)) throw new Error("Retracted evidence can be resolved only once");
    if (replacementIds.has(replacementEvidenceId)) throw new Error("Replacement evidence can satisfy only one resolution");
    if (retractedEvidenceId === replacementEvidenceId) throw new Error("Replacement evidence must use a new evidence ID");
    if (!isRetracted(state, retractedEvidenceId)) throw new Error("A resolution must reference retracted evidence");
    if (hasObserverAttestation(state, retractedEvidenceId)) throw new Error("Resolved evidence cannot remain active");
    uint64(resolution.occurredAtSeconds, "Resolution time");
    canonicalDetail(resolution.detail, "Resolution detail");
    resolutionIds.add(resolutionId);
    resolvedRetractions.add(retractedEvidenceId);
    replacementIds.add(replacementEvidenceId);
  }
  assertResolutionGraphAcyclic(state.resolutions);
  for (const resolution of state.resolutions) {
    const legKey: SwapLeg = resolution.leg;
    const leg: SwapLegState = state[legKey];
    const fact = resolution.evidenceKind === "funding" ? leg.funding : leg.spend;
    if (!fact || fact.factId !== resolution.factId) {
      throw new Error("Resolution does not bind the active canonical chain fact");
    }
    validateObserverAttestation(state, legKey, fact, resolution.retractedAttestation);
    validateObserverAttestation(state, legKey, fact, resolution.replacementAttestation);
    if (resolution.occurredAtSeconds < resolution.retractedAttestation.observedAtSeconds
      || resolution.occurredAtSeconds < resolution.replacementAttestation.observedAtSeconds) {
      throw new Error("Evidence replacement cannot precede either observer report");
    }
    const collection: readonly ObserverAttestation[] = resolution.evidenceKind === "funding"
      ? (leg.fundingAttestations ?? [])
      : (leg.spendAttestations ?? []);
    const activeReplacement = collection.find((attestation) => (
      attestation.evidenceId === resolution.replacementEvidenceId
    ));
    if (activeReplacement) {
      if (!attestationsEqual(activeReplacement, resolution.replacementAttestation)) {
        throw new Error("Resolution replacement does not match its archived observer attestation");
      }
      continue;
    }
    if (!isRetracted(state, resolution.replacementEvidenceId)) {
      throw new Error("A resolution replacement must remain active in its recorded evidence collection");
    }
    const next = state.resolutions.find((candidate) => (
      candidate.retractedEvidenceId === resolution.replacementEvidenceId
    ));
    if (!next
      || next.leg !== resolution.leg
      || next.evidenceKind !== resolution.evidenceKind
      || next.factId !== resolution.factId
      || !attestationsEqual(next.retractedAttestation, resolution.replacementAttestation)) {
      throw new Error("A retracted replacement must have a consistent later resolution");
    }
  }
  for (const evidenceId of Object.keys(state.retractedEvidenceIds)) {
    const unresolved = hasObserverAttestation(state, evidenceId as Hex32)
      && state.disputes.some((dispute) => dispute.reason === "reorganization" && dispute.evidenceId === evidenceId);
    if (!unresolved && !resolvedRetractions.has(evidenceId)) {
      throw new Error("Retracted evidence must be either actively disputed or resolved in the audit graph");
    }
  }

  const hasObservedSecret = state.observedSecret !== undefined || state.observedSecretFactId !== undefined;
  if (hasObservedSecret && (state.observedSecret === undefined || state.observedSecretFactId === undefined)) {
    throw new Error("Observed secret and source fact must be recorded together");
  }
  const hasConfirmedSecret = state.confirmedSecret !== undefined || state.confirmedSecretFactId !== undefined;
  if (hasConfirmedSecret && (state.confirmedSecret === undefined || state.confirmedSecretFactId === undefined)) {
    throw new Error("Confirmed secret and source fact must be recorded together");
  }
  if (hasObservedSecret) {
    const observed = canonicalPreimage(state.observedSecret);
    const factId = canonicalHex32(state.observedSecretFactId as string, "Observed secret fact ID");
    if (sha256Hex(hexToBytes(observed)) !== state.terms.secretHash
      || state.evm.spend?.action !== "claim"
      || state.evm.spend.preimage !== observed
      || state.evm.spend.factId !== factId
      || (state.evm.phase !== "claim-seen" && state.evm.phase !== "claimed-confirmed")) {
      throw new Error("Observed secret must bind the active canonical EVM claim fact");
    }
  }
  if (hasConfirmedSecret) {
    const confirmed = canonicalPreimage(state.confirmedSecret);
    const factId = canonicalHex32(state.confirmedSecretFactId as string, "Confirmed secret fact ID");
    if (!hasObservedSecret
      || state.observedSecret !== confirmed
      || state.observedSecretFactId !== factId
      || state.evm.phase !== "claimed-confirmed"
      || state.evm.spend?.action !== "claim"
      || state.evm.spend.preimage !== confirmed
      || state.evm.spend.factId !== factId) {
      throw new Error("Confirmed secret must bind the policy-confirmed canonical EVM claim fact");
    }
  }
  if ((state.zec.phase === "claim-seen" || state.zec.phase === "claimed-confirmed") && !hasConfirmedSecret) {
    throw new Error("Persisted ZEC claim progression requires the confirmed canonical preimage");
  }

  if (state.terminal) {
    assertExactObjectFields(state.terminal, new Set(["kind", "occurredAtSeconds", "reason"]), "Terminal swap state");
    if (state.terminal.kind !== "expired") throw new Error("Unknown terminal swap state");
    uint64(state.terminal.occurredAtSeconds, "Swap expiry time");
    canonicalDetail(state.terminal.reason, "Expiry reason");
    const deadline = allAuthorized(state) ? state.terms.zecFundBy : state.terms.authorizationDeadline;
    if (state.terminal.occurredAtSeconds < deadline) throw new Error("Expired swap predates its active signed deadline");
    if (state.zec.phase !== "unfunded" || state.evm.phase !== "unfunded") {
      throw new Error("Expired swap cannot retain funding or spend state");
    }
    if (state.disputes.length > 0 || state.resolutions.length > 0 || Object.keys(state.retractedEvidenceIds).length > 0) {
      throw new Error("Expired swap cannot retain dispute recovery metadata");
    }
    if (state.observedSecret || state.observedSecretFactId || state.confirmedSecret || state.confirmedSecretFactId) {
      throw new Error("Expired swap cannot retain observed or confirmed secret state");
    }
  }
  return state;
}

function expectedFunding(state: SwapState, leg: SwapLeg) {
  const { terms } = state;
  if (leg === "zec") {
    return {
      chain: terms.zecChain,
      asset: terms.zecAsset,
      amountAtoms: terms.zecAmountZatoshis,
      lockIdentity: terms.zcashLockScriptHash,
      escrowRecordId: state.swapId,
      funder: terms.zecSellerId,
      claimRecipient: terms.zcashClaimPubKeyHash,
      refundRecipient: terms.zcashRefundPubKeyHash,
      secretHash: terms.secretHash,
      refundTime: terms.zecRefundTime,
    };
  }
  return {
    chain: terms.quoteChain,
    asset: terms.quoteAsset,
    amountAtoms: terms.quoteAmountAtoms,
    lockIdentity: terms.evmEscrowContract,
    escrowRecordId: state.swapId,
    funder: terms.evmFunder,
    claimRecipient: terms.evmClaimRecipient,
    refundRecipient: terms.evmRefundRecipient,
    secretHash: terms.secretHash,
    refundTime: terms.evmRefundTime,
  };
}

export function createSwapState(
  terms: SwapTermsV1,
  timingPolicy: SwapTimingPolicy,
  evidencePolicies: SwapEvidencePolicies,
  marketPolicy: SwapMarketPolicyV1,
): SwapState {
  const validated = assertSwapTimingPolicy(terms, timingPolicy);
  const validatedMarketPolicy = assertApprovedSwapMarket(validated, marketPolicy);
  const validatedEvidencePolicies = assertSwapEvidencePolicies(validated, evidencePolicies);
  return Object.freeze({
    terms: validated,
    termsHash: hashSwapTerms(validated),
    swapId: swapIdForTerms(validated),
    timingPolicy: Object.freeze({ ...timingPolicy }),
    marketPolicy: validatedMarketPolicy,
    evidencePolicies: validatedEvidencePolicies,
    authorizations: Object.freeze({}),
    zec: EMPTY_LEG,
    evm: EMPTY_LEG,
    disputes: Object.freeze([]),
    resolutions: Object.freeze([]),
    retractedEvidenceIds: Object.freeze({}),
  });
}

export function authorizeSwapTerms(
  state: SwapState,
  partyId: Hex32,
  termsHash: Hex32,
  nowSeconds: bigint,
): SwapState {
  assertSwapStateIntegrity(state);
  if (state.terminal) throw new Error("Swap is terminal; no further transitions are allowed");
  uint64(nowSeconds, "Authorization time");
  if (nowSeconds >= state.terms.authorizationDeadline) throw new Error("Swap authorization deadline has passed");
  if (canonicalHex32(termsHash, "Authorized terms hash") !== state.termsHash) throw new Error("Authorized terms hash does not match");
  const role = roleForParty(state.terms, partyId);
  if (Object.hasOwn(state.authorizations, role)) return state;
  return Object.freeze({
    ...state,
    authorizations: Object.freeze({ ...state.authorizations, [role]: nowSeconds }),
  });
}

export function prepareSwapFunding(
  state: SwapState,
  leg: SwapLeg,
  artifactHash: Hex32,
  nowSeconds: bigint,
): SwapState {
  assertNotDisputed(state);
  uint64(nowSeconds, "Funding preparation time");
  if (!allAuthorized(state)) throw new Error("Both parties must authorize exact swap terms before funding");
  const current = state[leg];
  if (current.phase !== "unfunded") throw new Error(`${leg.toUpperCase()} funding is already prepared or observed`);
  if (leg === "zec") {
    if (nowSeconds < latestAuthorizationTime(state)) throw new Error("Funding preparation cannot predate exact terms authorization");
    if (nowSeconds >= state.terms.zecFundBy) throw new Error("ZEC funding cutoff has passed");
  } else {
    if (state.zec.phase !== "funded-confirmed") throw new Error("EVM funding requires confirmed ZEC funding");
    if (nowSeconds < latestAuthorizationTime(state)) throw new Error("Funding preparation cannot predate exact terms authorization");
    if (state.zec.fundingConfirmedAtSeconds !== undefined && nowSeconds < state.zec.fundingConfirmedAtSeconds) {
      throw new Error("EVM funding preparation cannot predate policy-confirmed ZEC funding");
    }
    if (nowSeconds > state.terms.evmFundBy || nowSeconds >= state.terms.evmClaimSafetyCutoff) {
      throw new Error("Safe EVM funding window has closed");
    }
  }
  return Object.freeze({
    ...state,
    [leg]: Object.freeze({
      phase: "funding-prepared",
      fundingArtifactHash: canonicalHex32(artifactHash, "Funding artifact hash"),
      fundingPreparedAtSeconds: nowSeconds,
    }),
  });
}

export function abandonSwapFunding(
  state: SwapState,
  leg: SwapLeg,
  artifactHash: Hex32,
  occurredAtSeconds: bigint,
): SwapState {
  assertNotDisputed(state);
  uint64(occurredAtSeconds, "Funding abandonment time");
  const current = state[leg];
  if (current.phase !== "funding-prepared" || !current.fundingArtifactHash) {
    throw new Error(`${leg.toUpperCase()} has no unbroadcast funding artifact to abandon`);
  }
  if (canonicalHex32(artifactHash, "Funding artifact hash") !== current.fundingArtifactHash) {
    throw new Error("Funding abandonment does not match the prepared artifact");
  }
  return Object.freeze({ ...state, [leg]: EMPTY_LEG });
}

export function expireSwap(state: SwapState, occurredAtSeconds: bigint, reason: string): SwapState {
  assertNotDisputed(state);
  uint64(occurredAtSeconds, "Swap expiry time");
  if (reason.length === 0 || reason.length > 500 || reason.trim() !== reason) {
    throw new TypeError("Expiry reason must be a non-empty canonical message");
  }
  const hasChainEvidence = [state.zec.phase, state.evm.phase]
    .some((phase) => phase !== "unfunded" && phase !== "funding-prepared");
  if (hasChainEvidence) throw new Error("A swap with observed chain evidence must use claim or refund recovery");
  const deadline = allAuthorized(state) ? state.terms.zecFundBy : state.terms.authorizationDeadline;
  if (occurredAtSeconds < deadline) throw new Error("Swap cannot expire before its active signed deadline");
  return Object.freeze({
    ...state,
    zec: EMPTY_LEG,
    evm: EMPTY_LEG,
    terminal: Object.freeze({ kind: "expired", occurredAtSeconds, reason }),
  });
}

function finalityPolicyFor(state: SwapState, leg: SwapLeg) {
  return leg === "zec" ? state.evidencePolicies.zecFinality : state.evidencePolicies.evmFinality;
}

function finalityPolicyIdFor(state: SwapState, leg: SwapLeg): Hex32 {
  return leg === "zec" ? state.terms.zecFinalityPolicyId : state.terms.evmFinalityPolicyId;
}

function validateObserverAttestation(
  state: SwapState,
  leg: SwapLeg,
  fact: FundingFact | SpendFact,
  attestation: ObserverAttestation,
): ObserverAttestation {
  const normalized: ObserverAttestation = Object.freeze({
    evidenceId: canonicalHex32(attestation.evidenceId, "Attestation evidence ID"),
    factId: canonicalHex32(attestation.factId, "Attested fact ID"),
    sourceId: canonicalHex32(attestation.sourceId, "Observer source ID"),
    observerPolicyId: canonicalHex32(attestation.observerPolicyId, "Observer policy ID"),
    finalityPolicyId: canonicalHex32(attestation.finalityPolicyId, "Finality policy ID"),
    observedAtSeconds: uint64(attestation.observedAtSeconds, "Observation time"),
    tipBlockHash: canonicalHex32(attestation.tipBlockHash, "Observer tip block hash"),
    tipBlockHeight: uint64(attestation.tipBlockHeight, "Observer tip block height"),
  });
  if (normalized.factId !== fact.factId) throw new Error("Observer attestation does not bind the chain fact");
  if (!state.evidencePolicies.observer.sourceIds.includes(normalized.sourceId)) throw new Error("Observer source is not approved");
  if (normalized.observerPolicyId !== state.terms.observerPolicyId) throw new Error("Observer policy does not match signed terms");
  if (normalized.finalityPolicyId !== finalityPolicyIdFor(state, leg)) throw new Error("Finality policy does not match signed terms");
  if (normalized.tipBlockHeight < fact.blockHeight) throw new Error("Observer tip predates the chain fact");
  if (normalized.observedAtSeconds < fact.executedAtSeconds) throw new Error("Observation cannot predate chain execution");
  if (normalized.observedAtSeconds - fact.executedAtSeconds > state.evidencePolicies.observer.maxObservationDelaySeconds) {
    throw new Error("Observer attestation is stale");
  }
  return normalized;
}

function validateFundingEvidence(state: SwapState, evidence: FundingEvidence): FundingEvidence {
  const fact = evidence.fact;
  if (fact.leg !== "zec" && fact.leg !== "evm") throw new TypeError("Funding fact leg is not recognized");
  const expected = expectedFunding(state, fact.leg);
  const current = state[fact.leg];
  const unsigned: Omit<FundingFact, "factId"> = {
    leg: fact.leg,
    swapId: canonicalHex32(fact.swapId, "Funding swap ID"),
    termsHash: canonicalHex32(fact.termsHash, "Funding terms hash"),
    transactionId: canonicalHex32(fact.transactionId, "Funding transaction ID"),
    blockHash: canonicalHex32(fact.blockHash, "Funding block hash"),
    blockHeight: uint64(fact.blockHeight, "Funding block height"),
    executedAtSeconds: uint64(fact.executedAtSeconds, "Funding execution time"),
    outputIndex: uint64(fact.outputIndex, "Funding output index"),
    chain: fact.chain,
    asset: fact.asset,
    amountAtoms: uint64(fact.amountAtoms, "Funding amount", false),
    lockIdentity: fact.lockIdentity,
    escrowRecordId: canonicalHex32(fact.escrowRecordId, "Escrow record ID"),
    funder: fact.funder,
    claimRecipient: fact.claimRecipient,
    refundRecipient: fact.refundRecipient,
    secretHash: canonicalHex32(fact.secretHash, "Funding secret hash"),
    refundTime: uint64(fact.refundTime, "Funding refund time", false),
    successful: fact.successful,
  };
  const normalizedFact: FundingFact = Object.freeze({ factId: canonicalHex32(fact.factId, "Funding fact ID"), ...unsigned });
  if (normalizedFact.factId !== fundingFactId(unsigned)) throw new Error("Funding fact ID does not match its canonical content");
  if (normalizedFact.swapId !== state.swapId || normalizedFact.termsHash !== state.termsHash) {
    throw new Error("Funding fact does not bind this swap");
  }
  if (normalizedFact.successful !== true) throw new Error("Failed transaction execution is not funding evidence");
  for (const key of [
    "chain", "asset", "amountAtoms", "lockIdentity", "escrowRecordId", "funder", "claimRecipient",
    "refundRecipient", "secretHash", "refundTime",
  ] as const) {
    if (normalizedFact[key] !== expected[key]) throw new Error(`Funding evidence ${key} does not match swap terms`);
  }
  if (normalizedFact.leg === "zec" && normalizedFact.executedAtSeconds >= state.terms.zecFundBy) {
    throw new Error("ZEC funding was executed at or after its signed cutoff");
  }
  if (normalizedFact.leg === "evm" && normalizedFact.executedAtSeconds > state.terms.evmFundBy) {
    throw new Error("EVM funding was executed after its signed cutoff");
  }
  if (current.fundingPreparedAtSeconds === undefined
    || normalizedFact.executedAtSeconds < current.fundingPreparedAtSeconds) {
    throw new Error("Funding execution cannot predate its prepared artifact");
  }
  if (normalizedFact.executedAtSeconds < latestAuthorizationTime(state)) {
    throw new Error("Funding execution cannot predate exact terms authorization");
  }
  if (normalizedFact.leg === "evm"
    && (state.zec.fundingConfirmedAtSeconds === undefined
      || normalizedFact.executedAtSeconds < state.zec.fundingConfirmedAtSeconds)) {
    throw new Error("EVM funding execution cannot predate policy-confirmed ZEC funding");
  }
  const attestation = validateObserverAttestation(state, normalizedFact.leg, normalizedFact, evidence.attestation);
  return Object.freeze({ fact: normalizedFact, attestation });
}

function addAttestation(
  current: readonly ObserverAttestation[] | undefined,
  attestation: ObserverAttestation,
): readonly ObserverAttestation[] {
  const existing = current ?? [];
  const duplicate = existing.find((item) => item.evidenceId === attestation.evidenceId);
  if (duplicate) {
    if (Object.keys(duplicate).some((key) => (
      duplicate[key as keyof ObserverAttestation] !== attestation[key as keyof ObserverAttestation]
    ))) {
      throw new Error("Observer evidence ID cannot be reused for different attestation content");
    }
    return existing;
  }
  if (existing.some((item) => item.sourceId === attestation.sourceId)) {
    throw new Error("Observer source cannot attest twice to the same chain fact");
  }
  return Object.freeze([...existing, attestation]);
}

function observerViewConflicts(
  current: readonly ObserverAttestation[] | undefined,
  attestation: ObserverAttestation,
): boolean {
  return (current ?? []).some((item) => (
    item.tipBlockHeight !== attestation.tipBlockHeight || item.tipBlockHash !== attestation.tipBlockHash
  ));
}

function assertFreshAttestationId(
  state: SwapState,
  current: readonly ObserverAttestation[] | undefined,
  attestation: ObserverAttestation,
): void {
  if (hasObserverAttestation(state, attestation.evidenceId)
    && !(current ?? []).some((item) => item.evidenceId === attestation.evidenceId)) {
    throw new Error("Observer evidence ID is already active elsewhere in this swap");
  }
}

function withObserverConflict(state: SwapState, evidenceId: Hex32, detail: string): SwapState {
  const dispute: SwapDispute = Object.freeze({
    reason: "observer-conflict",
    evidenceId,
    detail: canonicalDetail(detail, "Dispute detail"),
  });
  return assertSwapStateIntegrity(Object.freeze({
    ...state,
    disputes: Object.freeze([...state.disputes, dispute]),
  }));
}

export function observeSwapFunding(state: SwapState, evidence: FundingEvidence): SwapState {
  assertNotDisputed(state);
  const validated = validateFundingEvidence(state, evidence);
  const current = state[validated.fact.leg];
  if (current.phase !== "funding-prepared" && current.phase !== "funding-seen") {
    throw new Error(`${validated.fact.leg.toUpperCase()} funding was not prepared`);
  }
  if (current.funding && current.funding.factId !== validated.fact.factId) {
    throw new Error("Observer reports conflict on the funded chain fact");
  }
  assertFreshAttestationId(state, current.fundingAttestations, validated.attestation);
  const viewConflict = observerViewConflicts(current.fundingAttestations, validated.attestation);
  const attestations = addAttestation(current.fundingAttestations, validated.attestation);
  const next = Object.freeze({
    ...state,
    [validated.fact.leg]: Object.freeze({
      ...current,
      phase: "funding-seen",
      funding: current.funding ?? validated.fact,
      fundingAttestations: attestations,
    }),
  });
  if (viewConflict) {
    return withObserverConflict(
      next,
      validated.attestation.evidenceId,
      `${validated.fact.leg.toUpperCase()} funding observers reported different canonical chain tips`,
    );
  }
  return next;
}

function assertPolicyQualified(
  state: SwapState,
  leg: SwapLeg,
  fact: FundingFact | SpendFact,
  attestations: readonly ObserverAttestation[] | undefined,
  qualifiedAtSeconds: bigint,
): void {
  uint64(qualifiedAtSeconds, "Qualification time");
  const policy = finalityPolicyFor(state, leg);
  const reports = attestations ?? [];
  const qualifying = reports.filter((attestation) => {
    if (isRetracted(state, attestation.evidenceId)) return false;
    const confirmations = attestation.tipBlockHeight - fact.blockHeight + 1n;
    const executionAge = attestation.observedAtSeconds - fact.executedAtSeconds;
    return confirmations >= policy.minimumConfirmations
      && executionAge >= policy.minimumAgeSeconds
      && qualifiedAtSeconds >= attestation.observedAtSeconds
      && qualifiedAtSeconds - attestation.observedAtSeconds <= state.evidencePolicies.observer.maxObservationDelaySeconds;
  });
  const sourcesByView = new Map<string, Set<string>>();
  for (const attestation of qualifying) {
    const view = `${attestation.tipBlockHeight}:${attestation.tipBlockHash}`;
    const sources = sourcesByView.get(view) ?? new Set<string>();
    sources.add(attestation.sourceId);
    sourcesByView.set(view, sources);
  }
  if (![...sourcesByView.values()].some((sources) => (
    BigInt(sources.size) >= state.evidencePolicies.observer.requiredSourceCount
  ))) {
    throw new Error("Observer quorum and finality policy are not satisfied on one canonical chain view");
  }
}

export function confirmSwapFunding(
  state: SwapState,
  leg: SwapLeg,
  factId: Hex32,
  qualifiedAtSeconds: bigint,
): SwapState {
  assertNotDisputed(state);
  const current = state[leg];
  if (current.phase !== "funding-seen" || !current.funding) throw new Error(`${leg.toUpperCase()} funding has not been observed`);
  if (canonicalHex32(factId, "Funding fact ID") !== current.funding.factId) throw new Error("Funding confirmation fact does not match");
  assertPolicyQualified(state, leg, current.funding, current.fundingAttestations, qualifiedAtSeconds);
  return Object.freeze({
    ...state,
    [leg]: Object.freeze({ ...current, phase: "funded-confirmed", fundingConfirmedAtSeconds: qualifiedAtSeconds }),
  });
}

function expectedSpendRecipient(terms: SwapTermsV1, leg: SwapLeg, action: "claim" | "refund"): string {
  if (leg === "zec") return action === "claim" ? terms.zcashClaimPubKeyHash : terms.zcashRefundPubKeyHash;
  return action === "claim" ? terms.evmClaimRecipient : terms.evmRefundRecipient;
}

function canonicalPreimage(value: string | undefined): `0x${string}` {
  if (!value || !/^0x[0-9a-f]{64}$/.test(value)) throw new TypeError("Claim preimage must be exactly 32 lowercase bytes");
  return value as `0x${string}`;
}

function validateSpendEvidence(state: SwapState, evidence: SpendEvidence): SpendEvidence {
  const fact = evidence.fact;
  if (fact.leg !== "zec" && fact.leg !== "evm") throw new TypeError("Spend fact leg is not recognized");
  if (fact.action !== "claim" && fact.action !== "refund") throw new TypeError("Spend action is not recognized");
  const current = state[fact.leg];
  if (!current.funding) throw new Error("Spend evidence requires an exact funded chain fact");
  const unsigned: Omit<SpendFact, "factId"> = {
    fundingFactId: canonicalHex32(fact.fundingFactId, "Spend funding fact ID"),
    fundingTransactionId: canonicalHex32(fact.fundingTransactionId, "Spend funding transaction ID"),
    fundingOutputIndex: uint64(fact.fundingOutputIndex, "Spend funding output index"),
    leg: fact.leg,
    action: fact.action,
    swapId: canonicalHex32(fact.swapId, "Spend swap ID"),
    termsHash: canonicalHex32(fact.termsHash, "Spend terms hash"),
    transactionId: canonicalHex32(fact.transactionId, "Spend transaction ID"),
    blockHash: canonicalHex32(fact.blockHash, "Spend block hash"),
    blockHeight: uint64(fact.blockHeight, "Spend block height"),
    executedAtSeconds: uint64(fact.executedAtSeconds, "Spend execution time"),
    inputOrLogIndex: uint64(fact.inputOrLogIndex, "Spend input or log index"),
    chain: fact.chain,
    asset: fact.asset,
    amountAtoms: uint64(fact.amountAtoms, "Spend amount", false),
    lockIdentity: fact.lockIdentity,
    escrowRecordId: canonicalHex32(fact.escrowRecordId, "Spend escrow record ID"),
    recipient: fact.recipient,
    successful: fact.successful,
    ...(fact.preimage === undefined ? {} : { preimage: fact.preimage }),
  };
  const normalizedFact: SpendFact = Object.freeze({ factId: canonicalHex32(fact.factId, "Spend fact ID"), ...unsigned });
  if (normalizedFact.factId !== spendFactId(unsigned)) throw new Error("Spend fact ID does not match its canonical content");
  if (normalizedFact.swapId !== state.swapId || normalizedFact.termsHash !== state.termsHash) {
    throw new Error("Spend fact does not bind this swap");
  }
  if (
    normalizedFact.fundingFactId !== current.funding.factId
    || normalizedFact.fundingTransactionId !== current.funding.transactionId
    || normalizedFact.fundingOutputIndex !== current.funding.outputIndex
    || normalizedFact.lockIdentity !== current.funding.lockIdentity
    || normalizedFact.escrowRecordId !== current.funding.escrowRecordId
    || normalizedFact.chain !== current.funding.chain
    || normalizedFact.asset !== current.funding.asset
    || normalizedFact.amountAtoms !== current.funding.amountAtoms
  ) {
    throw new Error("Spend fact does not bind the funded outpoint or escrow record");
  }
  if (normalizedFact.recipient !== expectedSpendRecipient(state.terms, fact.leg, fact.action)) {
    throw new Error("Spend evidence recipient does not match swap terms");
  }
  if (normalizedFact.successful !== true) throw new Error("Failed transaction execution is not spend evidence");
  if (current.fundingConfirmedAtSeconds === undefined
    || normalizedFact.executedAtSeconds < current.fundingConfirmedAtSeconds
    || normalizedFact.executedAtSeconds < current.funding.executedAtSeconds
    || normalizedFact.blockHeight < current.funding.blockHeight) {
    throw new Error("Spend execution cannot predate its funded and policy-confirmed leg");
  }
  if (normalizedFact.action === "refund") {
    const deadline = normalizedFact.leg === "zec" ? state.terms.zecRefundTime : state.terms.evmRefundTime;
    if (normalizedFact.executedAtSeconds < deadline) throw new Error("Refund is not eligible before the signed deadline");
    if (normalizedFact.preimage !== undefined) throw new Error("Refund evidence cannot reveal a claim preimage");
  } else {
    const preimage = canonicalPreimage(normalizedFact.preimage);
    if (sha256Hex(hexToBytes(preimage)) !== state.terms.secretHash) {
      throw new Error("Claim preimage does not match the signed hashlock");
    }
    if (normalizedFact.leg === "evm" && normalizedFact.executedAtSeconds > state.terms.evmClaimSafetyCutoff) {
      throw new Error("EVM claim cannot be accepted after its signed claim cutoff");
    }
  }
  const attestation = validateObserverAttestation(state, normalizedFact.leg, normalizedFact, evidence.attestation);
  return Object.freeze({ fact: normalizedFact, attestation });
}

export function observeSwapSpend(state: SwapState, evidence: SpendEvidence): SwapState {
  assertNotDisputed(state);
  const spendEvidence = validateSpendEvidence(state, evidence);
  const { fact: spend } = spendEvidence;
  const current = state[spend.leg];
  const seenPhase = spend.action === "claim" ? "claim-seen" : "refund-seen";
  if (current.spend && current.spend.action !== spend.action) {
    throw new Error(`${spend.leg.toUpperCase()} claim and refund are mutually exclusive`);
  }
  if (current.phase !== "funded-confirmed" && current.phase !== seenPhase) {
    throw new Error(`${spend.leg.toUpperCase()} leg is not available to spend`);
  }
  if (current.spend && current.spend.factId !== spend.factId) {
    throw new Error("Observer reports conflict on the spend chain fact");
  }
  if (spend.leg === "zec" && spend.action === "claim") {
    if (state.evm.phase !== "claimed-confirmed" || !state.confirmedSecret) {
      throw new Error("ZEC claim requires a policy-confirmed EVM claim");
    }
    if (state.confirmedSecret !== spend.preimage) throw new Error("ZEC claim requires the confirmed canonical preimage");
  }
  assertFreshAttestationId(state, current.spendAttestations, spendEvidence.attestation);
  const viewConflict = observerViewConflicts(current.spendAttestations, spendEvidence.attestation);
  const attestations = addAttestation(current.spendAttestations, spendEvidence.attestation);
  const next = Object.freeze({
    ...current,
    phase: seenPhase,
    spend: current.spend ?? spend,
    spendAttestations: attestations,
  });
  let nextState: SwapState;
  if (spend.leg === "evm" && spend.action === "claim") {
    const preimage = canonicalPreimage(spend.preimage);
    nextState = Object.freeze({
      ...state,
      evm: next,
      observedSecret: state.observedSecret ?? preimage,
      observedSecretFactId: state.observedSecretFactId ?? spend.factId,
    });
  } else {
    nextState = Object.freeze({ ...state, [spend.leg]: next });
  }
  if (viewConflict) {
    return withObserverConflict(
      nextState,
      spendEvidence.attestation.evidenceId,
      `${spend.leg.toUpperCase()} spend observers reported different canonical chain tips`,
    );
  }
  return nextState;
}

export function confirmSwapSpend(
  state: SwapState,
  leg: SwapLeg,
  factId: Hex32,
  qualifiedAtSeconds: bigint,
): SwapState {
  assertNotDisputed(state);
  const current = state[leg];
  if ((current.phase !== "claim-seen" && current.phase !== "refund-seen") || !current.spend) {
    throw new Error(`${leg.toUpperCase()} spend has not been observed`);
  }
  if (canonicalHex32(factId, "Spend fact ID") !== current.spend.factId) throw new Error("Spend confirmation fact does not match");
  assertPolicyQualified(state, leg, current.spend, current.spendAttestations, qualifiedAtSeconds);
  const phase = current.phase === "claim-seen" ? "claimed-confirmed" : "refunded-confirmed";
  const nextState: SwapState = Object.freeze({
    ...state,
    [leg]: Object.freeze({ ...current, phase, spendConfirmedAtSeconds: qualifiedAtSeconds }),
  });
  if (leg === "evm" && phase === "claimed-confirmed") {
    const preimage = canonicalPreimage(current.spend.preimage);
    return Object.freeze({
      ...nextState,
      confirmedSecret: preimage,
      confirmedSecretFactId: current.spend.factId,
    });
  }
  return nextState;
}

function canonicalDetail(detail: string, label: string): string {
  if (detail.length === 0 || detail.length > 500 || detail.trim() !== detail) {
    throw new TypeError(`${label} must be a non-empty canonical message`);
  }
  return detail;
}

function resolutionContext(
  state: SwapState,
  leg: SwapLeg,
  evidenceKind: "funding" | "spend",
  retractedAttestation: ObserverAttestation,
  resolutionId: Hex32,
  replacementAttestation: ObserverAttestation,
  occurredAtSeconds: bigint,
  detail: string,
): Readonly<{ cleared: SwapState; resolution: SwapEvidenceResolution }> {
  assertSwapStateIntegrity(state);
  if (state.terminal) throw new Error("Swap is terminal; evidence cannot be replaced");
  const retracted = canonicalHex32(retractedAttestation.evidenceId, "Retracted evidence ID");
  if (!isRetracted(state, retracted)) throw new Error("Only retracted observer evidence can be replaced");
  const relevant = state.disputes.filter((dispute) => dispute.evidenceId === retracted && dispute.reason === "reorganization");
  if (relevant.length === 0 || relevant.length !== state.disputes.length) {
    throw new Error("Replacement cannot clear unrelated or unresolved disputes");
  }
  const id = canonicalHex32(resolutionId, "Resolution ID");
  if (state.resolutions.some((resolution) => resolution.resolutionId === id)) throw new Error("Resolution ID has already been used");
  const replacement = canonicalHex32(replacementAttestation.evidenceId, "Replacement evidence ID");
  if (isRetracted(state, replacement)) throw new Error("Replacement evidence is already retracted");
  if (hasEvidence(state, replacement)) throw new Error("Replacement evidence ID must be fresh for this swap");
  if (retractedAttestation.factId !== replacementAttestation.factId) {
    throw new Error("Replacement attestation must bind the retracted canonical fact");
  }
  uint64(occurredAtSeconds, "Evidence replacement time");
  const resolution: SwapEvidenceResolution = Object.freeze({
    resolutionId: id,
    leg,
    evidenceKind,
    factId: canonicalHex32(retractedAttestation.factId, "Resolved fact ID"),
    retractedEvidenceId: retracted,
    retractedSourceId: canonicalHex32(retractedAttestation.sourceId, "Retracted observer source ID"),
    retractedAttestation: Object.freeze({ ...retractedAttestation }),
    replacementEvidenceId: replacement,
    replacementSourceId: canonicalHex32(replacementAttestation.sourceId, "Replacement observer source ID"),
    replacementAttestation: Object.freeze({ ...replacementAttestation }),
    occurredAtSeconds,
    detail: canonicalDetail(detail, "Resolution detail"),
  });
  return { cleared: Object.freeze({ ...state, disputes: Object.freeze([]) }), resolution };
}

function assertReplacementViewAgrees(
  remaining: readonly ObserverAttestation[],
  replacement: ObserverAttestation,
): void {
  if (observerViewConflicts(remaining, replacement)) {
    throw new Error("Replacement attestation must agree with the remaining canonical observer chain view");
  }
}

export function replaceSwapFundingAttestation(
  state: SwapState,
  leg: SwapLeg,
  retractedEvidenceId: Hex32,
  replacement: FundingEvidence,
  resolutionId: Hex32,
  occurredAtSeconds: bigint,
  detail: string,
): SwapState {
  assertSwapStateIntegrity(state);
  const current = state[leg];
  if (current.phase !== "funding-seen" || !current.funding) {
    throw new Error("Only unconfirmed funding observations can be replaced");
  }
  const old = current.fundingAttestations?.find((item) => item.evidenceId === retractedEvidenceId);
  if (!old) throw new Error("Retracted funding attestation is not present");
  if (replacement.fact.factId !== current.funding.factId) {
    throw new Error("Replacement funding attestation must bind the same canonical fact");
  }
  const validatedReplacement = validateFundingEvidence(state, replacement);
  const context = resolutionContext(
    state,
    leg,
    "funding",
    old,
    resolutionId,
    validatedReplacement.attestation,
    occurredAtSeconds,
    detail,
  );
  if (occurredAtSeconds < validatedReplacement.attestation.observedAtSeconds) {
    throw new Error("Evidence replacement cannot precede its observer report");
  }
  const remaining = (current.fundingAttestations ?? []).filter((item) => item.evidenceId !== old.evidenceId);
  assertReplacementViewAgrees(remaining, validatedReplacement.attestation);
  const recovered: SwapState = Object.freeze({
    ...context.cleared,
    [leg]: Object.freeze({
      ...current,
      fundingAttestations: addAttestation(remaining, validatedReplacement.attestation),
    }),
    resolutions: Object.freeze([...state.resolutions, context.resolution]),
  });
  return assertSwapStateIntegrity(recovered);
}

export function replaceSwapSpendAttestation(
  state: SwapState,
  leg: SwapLeg,
  retractedEvidenceId: Hex32,
  replacement: SpendEvidence,
  resolutionId: Hex32,
  occurredAtSeconds: bigint,
  detail: string,
): SwapState {
  assertSwapStateIntegrity(state);
  const current = state[leg];
  if ((current.phase !== "claim-seen" && current.phase !== "refund-seen") || !current.spend) {
    throw new Error("Only unconfirmed spend observations can be replaced");
  }
  const old = current.spendAttestations?.find((item) => item.evidenceId === retractedEvidenceId);
  if (!old) throw new Error("Retracted spend attestation is not present");
  if (replacement.fact.factId !== current.spend.factId) {
    throw new Error("Replacement spend attestation must bind the same canonical fact");
  }
  const validatedReplacement = validateSpendEvidence(state, replacement);
  const context = resolutionContext(
    state,
    leg,
    "spend",
    old,
    resolutionId,
    validatedReplacement.attestation,
    occurredAtSeconds,
    detail,
  );
  if (occurredAtSeconds < validatedReplacement.attestation.observedAtSeconds) {
    throw new Error("Evidence replacement cannot precede its observer report");
  }
  const remaining = (current.spendAttestations ?? []).filter((item) => item.evidenceId !== old.evidenceId);
  assertReplacementViewAgrees(remaining, validatedReplacement.attestation);
  const recovered: SwapState = Object.freeze({
    ...context.cleared,
    [leg]: Object.freeze({
      ...current,
      spendAttestations: addAttestation(remaining, validatedReplacement.attestation),
    }),
    resolutions: Object.freeze([...state.resolutions, context.resolution]),
  });
  return assertSwapStateIntegrity(recovered);
}

export function flagSwapDispute(
  state: SwapState,
  reason: SwapDisputeReason,
  detail: string,
  evidenceId?: Hex32,
): SwapState {
  assertSwapStateIntegrity(state);
  if (state.terminal) throw new Error("Swap is terminal; disputes cannot be added");
  if (!SWAP_DISPUTE_REASONS.has(reason)) throw new TypeError("Swap dispute reason is not recognized");
  canonicalDetail(detail, "Dispute detail");
  const normalizedEvidenceId = evidenceId === undefined ? undefined : canonicalHex32(evidenceId, "Disputed evidence ID");
  const duplicate = state.disputes.some((item) => (
    item.reason === reason && item.detail === detail && item.evidenceId === normalizedEvidenceId
  ));
  if (duplicate) return state;
  const dispute: SwapDispute = Object.freeze({ reason, detail, ...(normalizedEvidenceId ? { evidenceId: normalizedEvidenceId } : {}) });
  return assertSwapStateIntegrity(Object.freeze({ ...state, disputes: Object.freeze([...state.disputes, dispute]) }));
}

function hasEvidence(state: SwapState, evidenceId: Hex32): boolean {
  return [state.zec, state.evm].some((leg) => (
    leg.funding?.factId === evidenceId
    || leg.spend?.factId === evidenceId
    || leg.fundingAttestations?.some((item) => item.evidenceId === evidenceId)
    || leg.spendAttestations?.some((item) => item.evidenceId === evidenceId)
  ));
}

export function retractSwapEvidence(
  state: SwapState,
  evidenceId: Hex32,
  detail: string,
): SwapState {
  assertSwapStateIntegrity(state);
  const normalized = canonicalHex32(evidenceId, "Retracted evidence ID");
  if (!hasObserverAttestation(state, normalized)) throw new Error("Cannot retract unknown observer attestation");
  if (isRetracted(state, normalized)) return state;
  const confirmedCollection = [state.zec, state.evm].some((leg) => (
    (leg.fundingConfirmedAtSeconds !== undefined
      && leg.fundingAttestations?.some((item) => item.evidenceId === normalized))
    || (leg.spendConfirmedAtSeconds !== undefined
      && leg.spendAttestations?.some((item) => item.evidenceId === normalized))
  ));
  if (confirmedCollection) {
    throw new Error("Confirmed observer evidence requires an explicit rollback transition before replacement");
  }
  const canonicalMessage = canonicalDetail(detail, "Retraction detail");
  const retracted = Object.freeze({ ...state.retractedEvidenceIds, [normalized]: true as const });
  const dispute: SwapDispute = Object.freeze({
    reason: "reorganization",
    detail: canonicalMessage,
    evidenceId: normalized,
  });
  return assertSwapStateIntegrity(Object.freeze({
    ...state,
    retractedEvidenceIds: retracted,
    disputes: Object.freeze([...state.disputes, dispute]),
  }));
}

export function swapPhase(state: SwapState): SwapPhase {
  assertSwapStateIntegrity(state);
  if (state.terminal?.kind === "expired") return "expired";
  if (state.disputes.length > 0) return "disputed";
  if (state.zec.phase === "claimed-confirmed" && state.evm.phase === "claimed-confirmed") return "settled";
  const refundStarted = state.zec.phase.startsWith("refund") || state.evm.phase.startsWith("refund");
  if (refundStarted) {
    const zecRecovered = state.zec.phase === "unfunded" || state.zec.phase === "refunded-confirmed";
    const evmRecovered = state.evm.phase === "unfunded" || state.evm.phase === "refunded-confirmed";
    return zecRecovered && evmRecovered ? "refunded" : "refund-recovery";
  }
  if (!allAuthorized(state)) return "awaiting-authorizations";
  if (state.zec.phase === "unfunded" || state.zec.phase === "funding-prepared") return "awaiting-zec-funding";
  if (state.zec.phase === "funding-seen") return "awaiting-zec-confirmation";
  if (state.evm.phase === "unfunded" || state.evm.phase === "funding-prepared") return "awaiting-evm-funding";
  if (state.evm.phase === "funding-seen") return "awaiting-evm-confirmation";
  if (state.evm.phase === "claim-seen") return "secret-observed";
  if (state.evm.phase === "claimed-confirmed" && state.zec.phase === "funded-confirmed") return "awaiting-zec-claim";
  if (state.zec.phase === "claim-seen") return "awaiting-zec-claim";
  return "awaiting-evm-claim";
}
