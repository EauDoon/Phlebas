import { UINT64_MAX, normalizeHex32, type Hex32 } from "./order-domain.ts";
import { hashSwapTerms, roleForParty, swapIdForTerms, type SwapRole, type SwapTermsV1 } from "./swap-domain.ts";
import { assertSwapTimingPolicy, type SwapTimingPolicy } from "./swap-policy.ts";
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
  | "refunded";

export type FundingEvidence = Readonly<{
  evidenceId: Hex32;
  leg: SwapLeg;
  transactionId: Hex32;
  blockHash: Hex32;
  blockHeight: bigint;
  outputIndex: bigint;
  sourceId: Hex32;
  observedAtSeconds: bigint;
  chain: string;
  asset: string;
  amountAtoms: bigint;
  lockIdentity: string;
  recipient: string;
}>;

export type SpendEvidence = Readonly<{
  evidenceId: Hex32;
  leg: SwapLeg;
  action: "claim" | "refund";
  transactionId: Hex32;
  blockHash: Hex32;
  blockHeight: bigint;
  inputOrLogIndex: bigint;
  sourceId: Hex32;
  observedAtSeconds: bigint;
  chain: string;
  recipient: string;
  successful: boolean;
  preimage?: `0x${string}`;
}>;

export type SwapLegState = Readonly<{
  phase: SwapLegPhase;
  fundingArtifactHash?: Hex32;
  funding?: FundingEvidence;
  spend?: SpendEvidence;
}>;

export type SwapState = Readonly<{
  terms: SwapTermsV1;
  termsHash: Hex32;
  swapId: Hex32;
  timingPolicy: SwapTimingPolicy;
  authorizations: Readonly<Partial<Record<SwapRole, true>>>;
  zec: SwapLegState;
  evm: SwapLegState;
  secret?: `0x${string}`;
  secretEvidenceId?: Hex32;
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

function allAuthorized(state: SwapState): boolean {
  return state.authorizations["zec-seller"] === true && state.authorizations["stablecoin-seller"] === true;
}

function expectedFunding(terms: SwapTermsV1, leg: SwapLeg) {
  if (leg === "zec") {
    return {
      chain: terms.zecChain,
      asset: terms.zecAsset,
      amountAtoms: terms.zecAmountZatoshis,
      lockIdentity: terms.zcashLockScriptHash,
      recipient: terms.zcashClaimPubKeyHash,
    };
  }
  return {
    chain: terms.quoteChain,
    asset: terms.quoteAsset,
    amountAtoms: terms.quoteAmountAtoms,
    lockIdentity: terms.evmEscrowContract,
    recipient: terms.evmClaimRecipient,
  };
}

export function createSwapState(terms: SwapTermsV1, timingPolicy: SwapTimingPolicy): SwapState {
  const validated = assertSwapTimingPolicy(terms, timingPolicy);
  return Object.freeze({
    terms: validated,
    termsHash: hashSwapTerms(validated),
    swapId: swapIdForTerms(validated),
    timingPolicy: Object.freeze({ ...timingPolicy }),
    authorizations: Object.freeze({}),
    zec: EMPTY_LEG,
    evm: EMPTY_LEG,
  });
}

export function authorizeSwapTerms(
  state: SwapState,
  partyId: Hex32,
  termsHash: Hex32,
  nowSeconds: bigint,
): SwapState {
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

function validateFundingEvidence(state: SwapState, evidence: FundingEvidence): FundingEvidence {
  const expected = expectedFunding(state.terms, evidence.leg);
  const normalized: FundingEvidence = Object.freeze({
    ...evidence,
    evidenceId: canonicalHex32(evidence.evidenceId, "Evidence ID"),
    transactionId: canonicalHex32(evidence.transactionId, "Funding transaction ID"),
    blockHash: canonicalHex32(evidence.blockHash, "Funding block hash"),
    blockHeight: uint64(evidence.blockHeight, "Funding block height"),
    outputIndex: uint64(evidence.outputIndex, "Funding output index"),
    sourceId: canonicalHex32(evidence.sourceId, "Observer source ID"),
    observedAtSeconds: uint64(evidence.observedAtSeconds, "Observation time"),
  });
  for (const key of ["chain", "asset", "amountAtoms", "lockIdentity", "recipient"] as const) {
    if (normalized[key] !== expected[key]) throw new Error(`Funding evidence ${key} does not match swap terms`);
  }
  return normalized;
}

export function observeSwapFunding(state: SwapState, evidence: FundingEvidence): SwapState {
  const current = state[evidence.leg];
  if (current.phase !== "funding-prepared") throw new Error(`${evidence.leg.toUpperCase()} funding was not prepared`);
  const funding = validateFundingEvidence(state, evidence);
  return Object.freeze({ ...state, [evidence.leg]: Object.freeze({ ...current, phase: "funding-seen", funding }) });
}

export function confirmSwapFunding(state: SwapState, leg: SwapLeg, evidenceId: Hex32): SwapState {
  const current = state[leg];
  if (current.phase !== "funding-seen" || !current.funding) throw new Error(`${leg.toUpperCase()} funding has not been observed`);
  if (canonicalHex32(evidenceId, "Evidence ID") !== current.funding.evidenceId) throw new Error("Funding confirmation evidence does not match");
  return Object.freeze({ ...state, [leg]: Object.freeze({ ...current, phase: "funded-confirmed" }) });
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
  const normalized: SpendEvidence = Object.freeze({
    ...evidence,
    evidenceId: canonicalHex32(evidence.evidenceId, "Evidence ID"),
    transactionId: canonicalHex32(evidence.transactionId, "Spend transaction ID"),
    blockHash: canonicalHex32(evidence.blockHash, "Spend block hash"),
    blockHeight: uint64(evidence.blockHeight, "Spend block height"),
    inputOrLogIndex: uint64(evidence.inputOrLogIndex, "Spend input or log index"),
    sourceId: canonicalHex32(evidence.sourceId, "Observer source ID"),
    observedAtSeconds: uint64(evidence.observedAtSeconds, "Spend observation time"),
  });
  const expectedChain = evidence.leg === "zec" ? state.terms.zecChain : state.terms.quoteChain;
  if (normalized.chain !== expectedChain) throw new Error("Spend evidence chain does not match swap terms");
  if (normalized.recipient !== expectedSpendRecipient(state.terms, evidence.leg, evidence.action)) {
    throw new Error("Spend evidence recipient does not match swap terms");
  }
  if (!normalized.successful) throw new Error("Failed transaction execution is not spend evidence");
  return normalized;
}

export function observeSwapSpend(state: SwapState, evidence: SpendEvidence): SwapState {
  const current = state[evidence.leg];
  if (current.phase !== "funded-confirmed") throw new Error(`${evidence.leg.toUpperCase()} leg is not available to spend`);
  const spend = validateSpendEvidence(state, evidence);
  if (spend.action === "refund") {
    const deadline = spend.leg === "zec" ? state.terms.zecRefundTime : state.terms.evmRefundTime;
    if (spend.observedAtSeconds < deadline) throw new Error("Refund is not eligible before the signed deadline");
    if (spend.preimage !== undefined) throw new Error("Refund evidence cannot reveal a claim preimage");
    return Object.freeze({ ...state, [spend.leg]: Object.freeze({ ...current, phase: "refund-seen", spend }) });
  }

  const preimage = canonicalPreimage(spend.preimage);
  if (sha256Hex(hexToBytes(preimage)) !== state.terms.secretHash) throw new Error("Claim preimage does not match the signed hashlock");
  if (spend.leg === "evm") {
    if (spend.observedAtSeconds >= state.terms.evmRefundTime) throw new Error("EVM claim cannot be accepted at or after its refund deadline");
    return Object.freeze({
      ...state,
      evm: Object.freeze({ ...current, phase: "claim-seen", spend }),
      secret: preimage,
      secretEvidenceId: spend.evidenceId,
    });
  }
  if (!state.secret || state.secret !== preimage) throw new Error("ZEC claim requires the canonical EVM-revealed preimage");
  return Object.freeze({ ...state, zec: Object.freeze({ ...current, phase: "claim-seen", spend }) });
}

export function confirmSwapSpend(state: SwapState, leg: SwapLeg, evidenceId: Hex32): SwapState {
  const current = state[leg];
  if ((current.phase !== "claim-seen" && current.phase !== "refund-seen") || !current.spend) {
    throw new Error(`${leg.toUpperCase()} spend has not been observed`);
  }
  if (canonicalHex32(evidenceId, "Evidence ID") !== current.spend.evidenceId) throw new Error("Spend confirmation evidence does not match");
  const phase = current.phase === "claim-seen" ? "claimed-confirmed" : "refunded-confirmed";
  return Object.freeze({ ...state, [leg]: Object.freeze({ ...current, phase }) });
}

export function swapPhase(state: SwapState): SwapPhase {
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
