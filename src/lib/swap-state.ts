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
  authorizations: Readonly<Partial<Record<SwapRole, true>>>;
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
  retractedEvidenceId: Hex32;
  replacementEvidenceId: Hex32;
  occurredAtSeconds: bigint;
  detail: string;
}>;

const EMPTY_LEG: SwapLegState = Object.freeze({ phase: "unfunded" });

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
  return state.authorizations["zec-seller"] === true && state.authorizations["stablecoin-seller"] === true;
}

function assertNotDisputed(state: SwapState): void {
  assertSwapStateIntegrity(state);
  if (state.terminal) throw new Error("Swap is terminal; no further transitions are allowed");
  if (state.disputes.length > 0) throw new Error("Swap is disputed; funding and claim actions are disabled");
}

export function assertSwapStateIntegrity(state: SwapState): SwapState {
  const validated = assertSwapTimingPolicy(state.terms, state.timingPolicy);
  assertApprovedSwapMarket(validated, state.marketPolicy);
  assertSwapEvidencePolicies(validated, state.evidencePolicies);
  if (hashSwapTerms(validated) !== state.termsHash) throw new Error("Swap state terms do not match the signed terms hash");
  if (swapIdForTerms(validated) !== state.swapId) throw new Error("Swap state terms do not match the swap ID");
  if (!Array.isArray(state.disputes) || !Array.isArray(state.resolutions)) {
    throw new TypeError("Swap recovery metadata must use canonical arrays");
  }
  if (!state.retractedEvidenceIds || typeof state.retractedEvidenceIds !== "object" || Array.isArray(state.retractedEvidenceIds)) {
    throw new TypeError("Retracted evidence IDs must use a canonical record");
  }
  for (const [evidenceId, retracted] of Object.entries(state.retractedEvidenceIds)) {
    canonicalHex32(evidenceId, "Retracted evidence ID");
    if (retracted !== true) throw new TypeError("Retracted evidence records must contain true values");
  }
  const resolutionIds = new Set<string>();
  for (const resolution of state.resolutions) {
    const resolutionId = canonicalHex32(resolution.resolutionId, "Resolution ID");
    const retractedEvidenceId = canonicalHex32(resolution.retractedEvidenceId, "Resolved evidence ID");
    const replacementEvidenceId = canonicalHex32(resolution.replacementEvidenceId, "Replacement evidence ID");
    if (resolutionIds.has(resolutionId)) throw new Error("Resolution IDs must be unique");
    if (retractedEvidenceId === replacementEvidenceId) throw new Error("Replacement evidence must use a new evidence ID");
    if (!state.retractedEvidenceIds[retractedEvidenceId]) throw new Error("A resolution must reference retracted evidence");
    uint64(resolution.occurredAtSeconds, "Resolution time");
    canonicalDetail(resolution.detail, "Resolution detail");
    resolutionIds.add(resolutionId);
  }
  if (state.terminal) {
    if (state.terminal.kind !== "expired") throw new Error("Unknown terminal swap state");
    uint64(state.terminal.occurredAtSeconds, "Swap expiry time");
    canonicalDetail(state.terminal.reason, "Expiry reason");
    const deadline = allAuthorized(state) ? state.terms.zecFundBy : state.terms.authorizationDeadline;
    if (state.terminal.occurredAtSeconds < deadline) throw new Error("Expired swap predates its active signed deadline");
    if (state.zec.phase !== "unfunded" || state.evm.phase !== "unfunded") {
      throw new Error("Expired swap cannot retain funding or spend state");
    }
    if (state.disputes.length > 0 || state.resolutions.length > 0) {
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
  if (state.authorizations[role]) return state;
  return Object.freeze({
    ...state,
    authorizations: Object.freeze({ ...state.authorizations, [role]: true }),
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
    if (nowSeconds >= state.terms.zecFundBy) throw new Error("ZEC funding cutoff has passed");
  } else {
    if (state.zec.phase !== "funded-confirmed") throw new Error("EVM funding requires confirmed ZEC funding");
    if (nowSeconds >= state.terms.evmFundBy || nowSeconds >= state.terms.evmClaimSafetyCutoff) {
      throw new Error("Safe EVM funding window has closed");
    }
  }
  return Object.freeze({
    ...state,
    [leg]: Object.freeze({ phase: "funding-prepared", fundingArtifactHash: canonicalHex32(artifactHash, "Funding artifact hash") }),
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
  const expected = expectedFunding(state, fact.leg);
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
  if (!normalizedFact.successful) throw new Error("Failed transaction execution is not funding evidence");
  for (const key of [
    "chain", "asset", "amountAtoms", "lockIdentity", "escrowRecordId", "funder", "claimRecipient",
    "refundRecipient", "secretHash", "refundTime",
  ] as const) {
    if (normalizedFact[key] !== expected[key]) throw new Error(`Funding evidence ${key} does not match swap terms`);
  }
  const cutoff = normalizedFact.leg === "zec" ? state.terms.zecFundBy : state.terms.evmFundBy;
  if (normalizedFact.executedAtSeconds >= cutoff) throw new Error("Funding was executed at or after its signed cutoff");
  const attestation = validateObserverAttestation(state, normalizedFact.leg, normalizedFact, evidence.attestation);
  return Object.freeze({ fact: normalizedFact, attestation });
}

function addAttestation(
  current: readonly ObserverAttestation[] | undefined,
  attestation: ObserverAttestation,
): readonly ObserverAttestation[] {
  const existing = current ?? [];
  if (existing.some((item) => item.evidenceId === attestation.evidenceId)) return existing;
  if (existing.some((item) => item.sourceId === attestation.sourceId)) {
    throw new Error("Observer source cannot attest twice to the same chain fact");
  }
  return Object.freeze([...existing, attestation]);
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
  const attestations = addAttestation(current.fundingAttestations, validated.attestation);
  return Object.freeze({
    ...state,
    [validated.fact.leg]: Object.freeze({
      ...current,
      phase: "funding-seen",
      funding: current.funding ?? validated.fact,
      fundingAttestations: attestations,
    }),
  });
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
    const confirmations = attestation.tipBlockHeight - fact.blockHeight + 1n;
    const executionAge = attestation.observedAtSeconds - fact.executedAtSeconds;
    return confirmations >= policy.minimumConfirmations
      && executionAge >= policy.minimumAgeSeconds
      && qualifiedAtSeconds >= attestation.observedAtSeconds
      && qualifiedAtSeconds - attestation.observedAtSeconds <= state.evidencePolicies.observer.maxObservationDelaySeconds;
  });
  if (BigInt(new Set(qualifying.map((attestation) => attestation.sourceId)).size)
    < state.evidencePolicies.observer.requiredSourceCount) {
    throw new Error("Observer quorum and finality policy are not satisfied");
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
  if (!normalizedFact.successful) throw new Error("Failed transaction execution is not spend evidence");
  if (normalizedFact.action === "refund") {
    const deadline = normalizedFact.leg === "zec" ? state.terms.zecRefundTime : state.terms.evmRefundTime;
    if (normalizedFact.executedAtSeconds < deadline) throw new Error("Refund is not eligible before the signed deadline");
    if (normalizedFact.preimage !== undefined) throw new Error("Refund evidence cannot reveal a claim preimage");
  } else {
    const preimage = canonicalPreimage(normalizedFact.preimage);
    if (sha256Hex(hexToBytes(preimage)) !== state.terms.secretHash) {
      throw new Error("Claim preimage does not match the signed hashlock");
    }
    const deadline = normalizedFact.leg === "zec" ? state.terms.zecRefundTime : state.terms.evmRefundTime;
    if (normalizedFact.executedAtSeconds >= deadline) throw new Error("Claim cannot be accepted at or after its refund deadline");
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
  const attestations = addAttestation(current.spendAttestations, spendEvidence.attestation);
  const next = Object.freeze({
    ...current,
    phase: seenPhase,
    spend: current.spend ?? spend,
    spendAttestations: attestations,
  });
  if (spend.leg === "evm" && spend.action === "claim") {
    const preimage = canonicalPreimage(spend.preimage);
    return Object.freeze({
      ...state,
      evm: next,
      observedSecret: state.observedSecret ?? preimage,
      observedSecretFactId: state.observedSecretFactId ?? spend.factId,
    });
  }
  return Object.freeze({ ...state, [spend.leg]: next });
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
  retractedEvidenceId: Hex32,
  resolutionId: Hex32,
  replacementEvidenceId: Hex32,
  occurredAtSeconds: bigint,
  detail: string,
): Readonly<{ cleared: SwapState; resolution: SwapEvidenceResolution }> {
  assertSwapStateIntegrity(state);
  if (state.terminal) throw new Error("Swap is terminal; evidence cannot be replaced");
  const retracted = canonicalHex32(retractedEvidenceId, "Retracted evidence ID");
  if (!state.retractedEvidenceIds[retracted]) throw new Error("Only retracted observer evidence can be replaced");
  const relevant = state.disputes.filter((dispute) => dispute.evidenceId === retracted && dispute.reason === "reorganization");
  if (relevant.length === 0 || relevant.length !== state.disputes.length) {
    throw new Error("Replacement cannot clear unrelated or unresolved disputes");
  }
  const id = canonicalHex32(resolutionId, "Resolution ID");
  if (state.resolutions.some((resolution) => resolution.resolutionId === id)) throw new Error("Resolution ID has already been used");
  const replacement = canonicalHex32(replacementEvidenceId, "Replacement evidence ID");
  if (state.retractedEvidenceIds[replacement]) throw new Error("Replacement evidence is already retracted");
  uint64(occurredAtSeconds, "Evidence replacement time");
  const resolution = Object.freeze({
    resolutionId: id,
    retractedEvidenceId: retracted,
    replacementEvidenceId: replacement,
    occurredAtSeconds,
    detail: canonicalDetail(detail, "Resolution detail"),
  });
  return { cleared: Object.freeze({ ...state, disputes: Object.freeze([]) }), resolution };
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
  const current = state[leg];
  if (current.phase !== "funding-seen" || !current.funding) {
    throw new Error("Only unconfirmed funding observations can be replaced");
  }
  const old = current.fundingAttestations?.find((item) => item.evidenceId === retractedEvidenceId);
  if (!old) throw new Error("Retracted funding attestation is not present");
  if (replacement.fact.factId !== current.funding.factId) {
    throw new Error("Replacement funding attestation must bind the same canonical fact");
  }
  const context = resolutionContext(
    state,
    retractedEvidenceId,
    resolutionId,
    replacement.attestation.evidenceId,
    occurredAtSeconds,
    detail,
  );
  if (occurredAtSeconds < replacement.attestation.observedAtSeconds) {
    throw new Error("Evidence replacement cannot precede its observer report");
  }
  const withoutOld: SwapState = Object.freeze({
    ...context.cleared,
    [leg]: Object.freeze({
      ...current,
      fundingAttestations: Object.freeze((current.fundingAttestations ?? []).filter((item) => item.evidenceId !== old.evidenceId)),
    }),
  });
  const recovered = observeSwapFunding(withoutOld, replacement);
  return Object.freeze({ ...recovered, resolutions: Object.freeze([...state.resolutions, context.resolution]) });
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
  const current = state[leg];
  if ((current.phase !== "claim-seen" && current.phase !== "refund-seen") || !current.spend) {
    throw new Error("Only unconfirmed spend observations can be replaced");
  }
  const old = current.spendAttestations?.find((item) => item.evidenceId === retractedEvidenceId);
  if (!old) throw new Error("Retracted spend attestation is not present");
  if (replacement.fact.factId !== current.spend.factId) {
    throw new Error("Replacement spend attestation must bind the same canonical fact");
  }
  const context = resolutionContext(
    state,
    retractedEvidenceId,
    resolutionId,
    replacement.attestation.evidenceId,
    occurredAtSeconds,
    detail,
  );
  if (occurredAtSeconds < replacement.attestation.observedAtSeconds) {
    throw new Error("Evidence replacement cannot precede its observer report");
  }
  const withoutOld: SwapState = Object.freeze({
    ...context.cleared,
    [leg]: Object.freeze({
      ...current,
      spendAttestations: Object.freeze((current.spendAttestations ?? []).filter((item) => item.evidenceId !== old.evidenceId)),
    }),
  });
  const recovered = observeSwapSpend(withoutOld, replacement);
  return Object.freeze({ ...recovered, resolutions: Object.freeze([...state.resolutions, context.resolution]) });
}

export function flagSwapDispute(
  state: SwapState,
  reason: SwapDisputeReason,
  detail: string,
  evidenceId?: Hex32,
): SwapState {
  assertSwapStateIntegrity(state);
  if (state.terminal) throw new Error("Swap is terminal; disputes cannot be added");
  canonicalDetail(detail, "Dispute detail");
  const normalizedEvidenceId = evidenceId === undefined ? undefined : canonicalHex32(evidenceId, "Disputed evidence ID");
  const duplicate = state.disputes.some((item) => (
    item.reason === reason && item.detail === detail && item.evidenceId === normalizedEvidenceId
  ));
  if (duplicate) return state;
  const dispute: SwapDispute = Object.freeze({ reason, detail, ...(normalizedEvidenceId ? { evidenceId: normalizedEvidenceId } : {}) });
  return Object.freeze({ ...state, disputes: Object.freeze([...state.disputes, dispute]) });
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
  if (!hasEvidence(state, normalized)) throw new Error("Cannot retract unknown swap evidence");
  if (state.retractedEvidenceIds[normalized]) return state;
  const retracted = Object.freeze({ ...state.retractedEvidenceIds, [normalized]: true as const });
  const disputed = flagSwapDispute(
    Object.freeze({ ...state, retractedEvidenceIds: retracted }),
    "reorganization",
    detail,
    normalized,
  );
  return disputed;
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
