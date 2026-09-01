import { createHash } from "node:crypto";

import {
  createAtomicSwapPlan,
  NO_VALUE_SWAP_GATES,
  type AtomicSwapLeg,
  type AtomicSwapPlan,
} from "./atomic-swap-plan.ts";
import { normalizeHex32, type Hex32 } from "./order-domain.ts";

/**
 * Canonical, key-independent terms for one matched fill.  The matcher never
 * signs these terms and never receives a wallet secret.  The terms are the
 * exact bytes that the two wallet owners must review and authorize later.
 */
export const SWAP_TERMS_VERSION = 1 as const;
export const SWAP_HASHLOCK_STATUS = "unresolved-wallet-authorization" as const;

export type SwapHashBinding = Readonly<{
  requestId: Hex32;
  status: typeof SWAP_HASHLOCK_STATUS;
  evm: Readonly<{
    algorithm: "sha256";
    digestLengthBytes: 32;
    digest: null;
  }>;
  zcash: Readonly<{
    algorithm: "hash160";
    digestLengthBytes: 20;
    digest: null;
  }>;
}>;

export type SwapTermsV1 = Readonly<Omit<AtomicSwapPlan, "planId"> & {
  hashBinding: SwapHashBinding;
}>;

export type SignedSwapTerms = Readonly<{
  version: typeof SWAP_TERMS_VERSION;
  swapId: Hex32;
  termsHash: Hex32;
  terms: SwapTermsV1;
}>;

/** A matched pair is exactly the input accepted by the no-value plan builder. */
export type MatchedOrderPair = Parameters<typeof createAtomicSwapPlan>[0];

const HEX_ZERO_32 = `0x${"00".repeat(32)}` as Hex32;
const CANONICAL_NO_VALUE_SWAP_GATES = Object.freeze([...NO_VALUE_SWAP_GATES]) as typeof NO_VALUE_SWAP_GATES;
const TOP_LEVEL_FIELDS = [
  "version",
  "settlementProtocolVersion",
  "venue",
  "fillIndex",
  "takerOrderHash",
  "counterpartyOrderHash",
  "executionPriceTicks",
  "baseAmountAtoms",
  "grossQuoteAtoms",
  "feeBps",
  "feeQuoteAtoms",
  "quoteTransferAtoms",
  "hashlockStatus",
  "hashlockDigest",
  "hashlockCommitmentRequestId",
  "stablecoinLeg",
  "zcashLeg",
  "deadlineOrdering",
  "platformRetainedBaseAtoms",
  "platformRetainedQuoteAtoms",
  "unilateralSpendingAuthority",
  "execution",
  "hashBinding",
] as const;
const LEG_FIELDS = [
  "assetRole",
  "network",
  "asset",
  "decimals",
  "amountAtoms",
  "funder",
  "claimant",
  "refundAccount",
  "hashAlgorithm",
  "hashlockStatus",
  "hashlockDigest",
  "hashlockCommitmentRequestId",
  "refundLock",
  "requiredConfirmations",
  "finalityRequirement",
  "transactionTemplate",
  "walletAuthorization",
  "broadcast",
] as const;

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object"
    && value !== null
    && Object.getPrototypeOf(value) === Object.prototype;
}

function assertExactFields(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const expectedSet = new Set(expected);
  for (const key of Object.keys(value)) {
    if (!expectedSet.has(key)) throw new TypeError(`${label} contains an unknown field`);
  }
  for (const key of expected) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) throw new TypeError(`${label} is missing ${key}`);
  }
}

function canonicalHex32(value: unknown, label: string, allowZero = false): Hex32 {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const normalized = normalizeHex32(value, label);
  if (value !== normalized) throw new TypeError(`${label} must be lowercase canonical hexadecimal`);
  if (!allowZero && normalized === HEX_ZERO_32) throw new TypeError(`${label} cannot be zero`);
  return normalized;
}

function canonicalDecimal(value: unknown, label: string, allowZero = false): string {
  if (typeof value !== "string" || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    throw new TypeError(`${label} must be a canonical unsigned decimal`);
  }
  if (!allowZero && value === "0") throw new RangeError(`${label} must be positive`);
  return value;
}

function canonicalText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0 || value.trim() !== value || value.includes("\n")) {
    throw new TypeError(`${label} must be a non-empty canonical string`);
  }
  return value;
}

function canonicalLeg(value: unknown, label: string): AtomicSwapLeg {
  if (!isPlainRecord(value)) throw new TypeError(`${label} must be a plain object`);
  assertExactFields(value, LEG_FIELDS, label);
  const refundLock = value.refundLock;
  if (!isPlainRecord(refundLock)) throw new TypeError(`${label} refund lock must be a plain object`);
  assertExactFields(refundLock, ["mode", "valueSeconds"], `${label} refund lock`);
  if (refundLock.mode !== "absolute-time") throw new TypeError(`${label} refund lock mode is invalid`);
  const leg = {
    assetRole: value.assetRole,
    network: canonicalText(value.network, `${label} network`),
    asset: canonicalText(value.asset, `${label} asset`),
    decimals: value.decimals,
    amountAtoms: canonicalDecimal(value.amountAtoms, `${label} amount`),
    funder: canonicalText(value.funder, `${label} funder`),
    claimant: canonicalText(value.claimant, `${label} claimant`),
    refundAccount: canonicalText(value.refundAccount, `${label} refund account`),
    hashAlgorithm: value.hashAlgorithm,
    hashlockStatus: value.hashlockStatus,
    hashlockDigest: value.hashlockDigest,
    hashlockCommitmentRequestId: canonicalHex32(value.hashlockCommitmentRequestId, `${label} hashlock request ID`),
    refundLock: {
      mode: refundLock.mode,
      valueSeconds: canonicalDecimal(refundLock.valueSeconds, `${label} refund time`),
    },
    requiredConfirmations: value.requiredConfirmations,
    finalityRequirement: value.finalityRequirement,
    transactionTemplate: value.transactionTemplate,
    walletAuthorization: value.walletAuthorization,
    broadcast: value.broadcast,
  } as AtomicSwapLeg;
  if (leg.assetRole !== "native-zec" && leg.assetRole !== "stablecoin") throw new TypeError(`${label} asset role is invalid`);
  if (leg.hashAlgorithm !== "sha256") throw new TypeError(`${label} hash algorithm is invalid`);
  if (leg.hashlockStatus !== SWAP_HASHLOCK_STATUS) throw new TypeError(`${label} hashlock status is invalid`);
  if (leg.hashlockDigest !== null) throw new Error(`${label} hashlock digest requires wallet authorization`);
  if (leg.transactionTemplate !== "unresolved-no-value") throw new Error(`${label} transaction template is not no-value`);
  if (leg.walletAuthorization !== "required") throw new Error(`${label} wallet authorization is required`);
  if (leg.broadcast !== "disabled") throw new Error(`${label} broadcast must remain disabled`);
  if (!Number.isSafeInteger(leg.decimals) || leg.decimals < 0 || leg.decimals > 255) {
    throw new RangeError(`${label} decimals must be an integer from 0 to 255`);
  }
  if (!Number.isSafeInteger(leg.requiredConfirmations) || leg.requiredConfirmations <= 0) {
    throw new RangeError(`${label} confirmations must be positive`);
  }
  return Object.freeze({ ...leg, refundLock: Object.freeze(leg.refundLock) });
}

function canonicalExecution(value: unknown): SwapTermsV1["execution"] {
  if (!isPlainRecord(value)) throw new TypeError("Swap execution must be a plain object");
  assertExactFields(value, ["mode", "status", "blockingGates"], "Swap execution");
  if (value.mode !== "no-value" || value.status !== "blocked" || !Array.isArray(value.blockingGates)) {
    throw new Error("Swap execution must remain blocked no-value");
  }
  if (value.blockingGates.length !== CANONICAL_NO_VALUE_SWAP_GATES.length
    || value.blockingGates.some((gate, index) => gate !== CANONICAL_NO_VALUE_SWAP_GATES[index])) {
    throw new Error("Swap execution must retain every no-value blocking gate in canonical order");
  }
  return Object.freeze({
    mode: "no-value",
    status: "blocked",
    blockingGates: CANONICAL_NO_VALUE_SWAP_GATES,
  });
}

function canonicalHashBinding(value: unknown, requestId: Hex32): SwapHashBinding {
  if (!isPlainRecord(value)) throw new TypeError("Swap hash binding must be a plain object");
  assertExactFields(value, ["requestId", "status", "evm", "zcash"], "Swap hash binding");
  if (canonicalHex32(value.requestId, "Swap hash binding request ID") !== requestId) {
    throw new Error("Swap hash binding does not match the plan request ID");
  }
  if (value.status !== SWAP_HASHLOCK_STATUS) throw new Error("Swap hash binding requires wallet authorization");
  for (const [key, algorithm, length] of [["evm", "sha256", 32], ["zcash", "hash160", 20]] as const) {
    const digest = value[key];
    if (!isPlainRecord(digest)) throw new TypeError(`Swap ${key} hash binding must be a plain object`);
    assertExactFields(digest, ["algorithm", "digestLengthBytes", "digest"], `Swap ${key} hash binding`);
    if (digest.algorithm !== algorithm || digest.digestLengthBytes !== length || digest.digest !== null) {
      throw new Error(`Swap ${key} hash binding is not canonical`);
    }
  }
  return Object.freeze({
    requestId,
    status: SWAP_HASHLOCK_STATUS,
    evm: Object.freeze({ algorithm: "sha256", digestLengthBytes: 32, digest: null }),
    zcash: Object.freeze({ algorithm: "hash160", digestLengthBytes: 20, digest: null }),
  });
}

/** Validate and deep-freeze canonical terms before they are hashed or shown. */
export function validateSwapTerms(terms: SwapTermsV1): SwapTermsV1 {
  if (!isPlainRecord(terms)) throw new TypeError("Swap terms must be a plain object");
  assertExactFields(terms, TOP_LEVEL_FIELDS, "Swap terms");
  if (terms.version !== SWAP_TERMS_VERSION) throw new TypeError("Unsupported swap terms version");
  if (terms.venue !== "order-book" && terms.venue !== "solver") throw new TypeError("Swap venue is invalid");
  if (!Number.isSafeInteger(terms.fillIndex) || terms.fillIndex < 0 || terms.fillIndex > 127) {
    throw new RangeError("Swap fill index must be an integer from 0 to 127");
  }
  const takerOrderHash = canonicalHex32(terms.takerOrderHash, "Taker order hash");
  const counterpartyOrderHash = canonicalHex32(terms.counterpartyOrderHash, "Counterparty order hash");
  if (takerOrderHash === counterpartyOrderHash) throw new Error("Swap orders must be distinct");
  const executionPriceTicks = canonicalDecimal(terms.executionPriceTicks, "Execution price");
  const baseAmountAtoms = canonicalDecimal(terms.baseAmountAtoms, "Base amount");
  const grossQuoteAtoms = canonicalDecimal(terms.grossQuoteAtoms, "Gross quote amount");
  const feeBps = canonicalDecimal(terms.feeBps, "Fee basis points", true);
  const feeQuoteAtoms = canonicalDecimal(terms.feeQuoteAtoms, "Fee quote amount", true);
  const quoteTransferAtoms = canonicalDecimal(terms.quoteTransferAtoms, "Quote transfer amount");
  const requestId = canonicalHex32(terms.hashlockCommitmentRequestId, "Swap hashlock request ID");
  const stablecoinLeg = canonicalLeg(terms.stablecoinLeg, "Stablecoin leg");
  const zcashLeg = canonicalLeg(terms.zcashLeg, "Zcash leg");
  if (stablecoinLeg.assetRole !== "stablecoin" || zcashLeg.assetRole !== "native-zec") {
    throw new Error("Swap legs must preserve their asset roles");
  }
  if (stablecoinLeg.hashlockCommitmentRequestId !== requestId || zcashLeg.hashlockCommitmentRequestId !== requestId) {
    throw new Error("Swap legs must share the plan hashlock request ID");
  }
  if (terms.hashlockStatus !== SWAP_HASHLOCK_STATUS || terms.hashlockDigest !== null) {
    throw new Error("Swap hashlock digest requires wallet authorization");
  }
  if (terms.deadlineOrdering !== "stablecoin-refund-before-zcash-refund") {
    throw new Error("Swap deadline ordering is invalid");
  }
  if (stablecoinLeg.finalityRequirement !== "l1-posted-and-confirmed"
    || zcashLeg.finalityRequirement !== "confirmed-zcash-block") {
    throw new Error("Swap leg finality requirements do not match their asset roles");
  }
  if (BigInt(stablecoinLeg.refundLock.valueSeconds) >= BigInt(zcashLeg.refundLock.valueSeconds)) {
    throw new Error("Stablecoin refund must remain earlier than the Zcash refund");
  }
  if (stablecoinLeg.amountAtoms !== quoteTransferAtoms || zcashLeg.amountAtoms !== baseAmountAtoms) {
    throw new Error("Swap leg amounts do not match the canonical fill amounts");
  }
  const grossQuote = BigInt(grossQuoteAtoms);
  const feeRate = BigInt(feeBps);
  const feeQuote = BigInt(feeQuoteAtoms);
  const quoteTransfer = BigInt(quoteTransferAtoms);
  if (feeRate > 10_000n || feeQuote !== ((grossQuote * feeRate) + 9_999n) / 10_000n) {
    throw new Error("Swap fee does not match the canonical gross quote amount");
  }
  if (quoteTransfer !== grossQuote + feeQuote
    && quoteTransfer !== grossQuote - feeQuote) {
    throw new Error("Swap quote transfer does not match the fee-adjusted fill amount");
  }
  if (terms.platformRetainedBaseAtoms !== "0" || terms.platformRetainedQuoteAtoms !== "0") {
    throw new Error("Swap terms cannot retain platform value");
  }
  if (terms.unilateralSpendingAuthority !== false) throw new Error("Swap terms cannot grant unilateral spending authority");
  const hashBinding = canonicalHashBinding(terms.hashBinding, requestId);
  return Object.freeze({
    version: SWAP_TERMS_VERSION,
    settlementProtocolVersion: canonicalText(terms.settlementProtocolVersion, "Settlement protocol version"),
    venue: terms.venue,
    fillIndex: terms.fillIndex,
    takerOrderHash,
    counterpartyOrderHash,
    executionPriceTicks,
    baseAmountAtoms,
    grossQuoteAtoms,
    feeBps,
    feeQuoteAtoms,
    quoteTransferAtoms,
    hashlockStatus: SWAP_HASHLOCK_STATUS,
    hashlockDigest: null,
    hashlockCommitmentRequestId: requestId,
    stablecoinLeg,
    zcashLeg,
    deadlineOrdering: "stablecoin-refund-before-zcash-refund",
    platformRetainedBaseAtoms: "0",
    platformRetainedQuoteAtoms: "0",
    unilateralSpendingAuthority: false,
    execution: canonicalExecution(terms.execution),
    hashBinding,
  });
}

/** Canonical UTF-8 text used for the signed terms digest. */
export function encodeSwapTerms(terms: SwapTermsV1): string {
  const value = validateSwapTerms(terms);
  return `PhlebasSwapTerms\n${JSON.stringify(value)}`;
}

function sha256Text(value: string): Hex32 {
  return `0x${createHash("sha256").update(value, "utf8").digest("hex")}` as Hex32;
}

export function hashSwapTerms(terms: SwapTermsV1): Hex32 {
  return sha256Text(encodeSwapTerms(terms));
}

export function swapIdForTerms(terms: SwapTermsV1): Hex32 {
  return sha256Text(`PhlebasSwapId\nversion=${SWAP_TERMS_VERSION}\ntermsHash=${hashSwapTerms(terms)}`);
}

function termsFromPlan(plan: AtomicSwapPlan): SwapTermsV1 {
  const { planId: _planId, ...withoutPlanId } = plan;
  void _planId;
  return {
    ...withoutPlanId,
    hashBinding: {
      requestId: plan.hashlockCommitmentRequestId,
      status: SWAP_HASHLOCK_STATUS,
      evm: { algorithm: "sha256", digestLengthBytes: 32, digest: null },
      zcash: { algorithm: "hash160", digestLengthBytes: 20, digest: null },
    },
  };
}

/**
 * Convert one validated matched order pair into immutable terms and IDs.  The
 * adapter has no signing, custody, transaction, or broadcast surface.
 */
export function adaptMatchedOrderPairToSwapTerms(input: MatchedOrderPair): SignedSwapTerms {
  const plan = createAtomicSwapPlan(input);
  const terms = validateSwapTerms(termsFromPlan(plan));
  const termsHash = hashSwapTerms(terms);
  return Object.freeze({
    version: SWAP_TERMS_VERSION,
    swapId: swapIdForTerms(terms),
    termsHash,
    terms,
  });
}

/** Explicit alias for callers that use the shorter adapter name. */
export const createSignedSwapTerms = adaptMatchedOrderPairToSwapTerms;

/** Validate a previously serialized or transported terms artifact. */
export function validateSignedSwapTerms(value: SignedSwapTerms): SignedSwapTerms {
  if (!isPlainRecord(value)) throw new TypeError("Signed swap terms must be a plain object");
  assertExactFields(value, ["version", "swapId", "termsHash", "terms"], "Signed swap terms");
  if (value.version !== SWAP_TERMS_VERSION) throw new TypeError("Unsupported signed swap terms version");
  const terms = validateSwapTerms(value.terms as SwapTermsV1);
  const termsHash = canonicalHex32(value.termsHash, "Swap terms hash");
  const swapId = canonicalHex32(value.swapId, "Swap ID");
  if (termsHash !== hashSwapTerms(terms)) throw new Error("Swap terms hash does not match canonical terms");
  if (swapId !== swapIdForTerms(terms)) throw new Error("Swap ID does not match canonical terms");
  return Object.freeze({ version: SWAP_TERMS_VERSION, swapId, termsHash, terms });
}

/** Kept public for tests and boundary code that receives a validated plan. */
export function swapTermsFromAtomicSwapPlan(plan: AtomicSwapPlan): SignedSwapTerms {
  if (!isPlainRecord(plan)) throw new TypeError("Atomic swap plan must be a plain object");
  const terms = validateSwapTerms(termsFromPlan(plan));
  const termsHash = hashSwapTerms(terms);
  return Object.freeze({ version: SWAP_TERMS_VERSION, swapId: swapIdForTerms(terms), termsHash, terms });
}
