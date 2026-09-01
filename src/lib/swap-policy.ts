import { UINT64_MAX, normalizeHex32, type Hex32 } from "./order-domain.ts";
import { sha256Hex } from "./sha256.ts";
import { validateSwapTerms, type SwapTermsV1 } from "./swap-domain.ts";

export type SwapTimingPolicy = Readonly<{
  minimumFundingWindowSeconds: bigint;
  minimumClaimWindowSeconds: bigint;
  minimumSafetyWindowSeconds: bigint;
}>;

export type SwapObserverPolicyV1 = Readonly<{
  version: 1;
  sourceIds: readonly Hex32[];
  requiredSourceCount: bigint;
  maxObservationDelaySeconds: bigint;
}>;

export type SwapFinalityPolicyV1 = Readonly<{
  version: 1;
  chain: string;
  minimumConfirmations: bigint;
  minimumAgeSeconds: bigint;
}>;

export type SwapEvidencePolicies = Readonly<{
  observer: SwapObserverPolicyV1;
  zecFinality: SwapFinalityPolicyV1;
  evmFinality: SwapFinalityPolicyV1;
}>;

export type SwapDeadlineStatus = Readonly<{
  authorizationOpen: boolean;
  zecFundingOpen: boolean;
  evmFundingOpen: boolean;
  evmClaimSafe: boolean;
  evmRefundEligible: boolean;
  zecRefundEligible: boolean;
}>;

function positiveUint64(value: bigint, label: string): bigint {
  if (typeof value !== "bigint") throw new TypeError(`${label} must be a bigint`);
  if (value <= 0n || value > UINT64_MAX) throw new RangeError(`${label} must be a positive uint64`);
  return value;
}

function uint64(value: bigint, label: string): bigint {
  if (typeof value !== "bigint") throw new TypeError(`${label} must be a bigint`);
  if (value < 0n || value > UINT64_MAX) throw new RangeError(`${label} must fit uint64`);
  return value;
}

function canonicalHex32(value: string, label: string): Hex32 {
  const normalized = normalizeHex32(value, label);
  if (normalized !== value || normalized === `0x${"00".repeat(32)}`) {
    throw new TypeError(`${label} must be nonzero lowercase canonical hexadecimal`);
  }
  return normalized;
}

export function validateSwapObserverPolicy(policy: SwapObserverPolicyV1): SwapObserverPolicyV1 {
  if (policy.version !== 1) throw new TypeError("Unsupported observer policy version");
  const sourceIds = policy.sourceIds.map((sourceId) => canonicalHex32(sourceId, "Observer source ID"));
  if (sourceIds.length < 2 || new Set(sourceIds).size !== sourceIds.length) {
    throw new Error("Observer policy requires at least two distinct sources");
  }
  const sorted = [...sourceIds].sort();
  if (sourceIds.some((sourceId, index) => sourceId !== sorted[index])) {
    throw new TypeError("Observer source IDs must be sorted canonically");
  }
  const requiredSourceCount = positiveUint64(policy.requiredSourceCount, "Required observer source count");
  if (requiredSourceCount < 2n || requiredSourceCount > BigInt(sourceIds.length)) {
    throw new RangeError("Required observer source count must fit the approved source set and be at least two");
  }
  const maxObservationDelaySeconds = positiveUint64(policy.maxObservationDelaySeconds, "Maximum observation delay");
  return Object.freeze({
    version: 1,
    sourceIds: Object.freeze(sourceIds),
    requiredSourceCount,
    maxObservationDelaySeconds,
  });
}

export function hashSwapObserverPolicy(policy: SwapObserverPolicyV1): Hex32 {
  const validated = validateSwapObserverPolicy(policy);
  return sha256Hex([
    "PhlebasSwapObserverPolicy",
    "version=1",
    `sourceIds=${validated.sourceIds.join(",")}`,
    `requiredSourceCount=${validated.requiredSourceCount}`,
    `maxObservationDelaySeconds=${validated.maxObservationDelaySeconds}`,
  ].join("\n"));
}

export function validateSwapFinalityPolicy(policy: SwapFinalityPolicyV1): SwapFinalityPolicyV1 {
  if (policy.version !== 1) throw new TypeError("Unsupported finality policy version");
  if (typeof policy.chain !== "string" || policy.chain.length === 0 || policy.chain.trim() !== policy.chain) {
    throw new TypeError("Finality policy chain must be canonical");
  }
  return Object.freeze({
    version: 1,
    chain: policy.chain,
    minimumConfirmations: positiveUint64(policy.minimumConfirmations, "Minimum confirmations"),
    minimumAgeSeconds: uint64(policy.minimumAgeSeconds, "Minimum finality age"),
  });
}

export function hashSwapFinalityPolicy(policy: SwapFinalityPolicyV1): Hex32 {
  const validated = validateSwapFinalityPolicy(policy);
  return sha256Hex([
    "PhlebasSwapFinalityPolicy",
    "version=1",
    `chain=${validated.chain}`,
    `minimumConfirmations=${validated.minimumConfirmations}`,
    `minimumAgeSeconds=${validated.minimumAgeSeconds}`,
  ].join("\n"));
}

export function assertSwapEvidencePolicies(terms: SwapTermsV1, policies: SwapEvidencePolicies): SwapEvidencePolicies {
  const observer = validateSwapObserverPolicy(policies.observer);
  const zecFinality = validateSwapFinalityPolicy(policies.zecFinality);
  const evmFinality = validateSwapFinalityPolicy(policies.evmFinality);
  if (hashSwapObserverPolicy(observer) !== terms.observerPolicyId) throw new Error("Observer policy does not match signed terms");
  if (zecFinality.chain !== terms.zecChain || hashSwapFinalityPolicy(zecFinality) !== terms.zecFinalityPolicyId) {
    throw new Error("ZEC finality policy does not match signed terms");
  }
  if (evmFinality.chain !== terms.quoteChain || hashSwapFinalityPolicy(evmFinality) !== terms.evmFinalityPolicyId) {
    throw new Error("EVM finality policy does not match signed terms");
  }
  return Object.freeze({ observer, zecFinality, evmFinality });
}

export function assertSwapTimingPolicy(terms: SwapTermsV1, policy: SwapTimingPolicy): SwapTermsV1 {
  const validated = validateSwapTerms(terms);
  const fundingWindow = positiveUint64(policy.minimumFundingWindowSeconds, "Minimum funding window");
  const claimWindow = positiveUint64(policy.minimumClaimWindowSeconds, "Minimum claim window");
  const safetyWindow = positiveUint64(policy.minimumSafetyWindowSeconds, "Minimum safety window");
  if (hashSwapTimingPolicy({
    minimumFundingWindowSeconds: fundingWindow,
    minimumClaimWindowSeconds: claimWindow,
    minimumSafetyWindowSeconds: safetyWindow,
  }) !== validated.timeoutPolicyId) {
    throw new Error("Timing policy does not match signed terms");
  }

  const ordered = [
    validated.authorizationDeadline,
    validated.zecFundBy,
    validated.evmFundBy,
    validated.evmClaimSafetyCutoff,
    validated.evmRefundTime,
    validated.zecRefundTime,
  ];
  if (ordered.some((deadline, index) => index > 0 && deadline <= ordered[index - 1])) {
    throw new RangeError("Swap deadlines must be strictly increasing");
  }
  if (validated.zecFundBy - validated.authorizationDeadline < fundingWindow) {
    throw new RangeError("ZEC funding window is below the policy minimum");
  }
  if (validated.evmFundBy - validated.zecFundBy < fundingWindow) {
    throw new RangeError("Second-leg funding window is below the policy minimum");
  }
  if (validated.evmClaimSafetyCutoff - validated.evmFundBy < claimWindow) {
    throw new RangeError("EVM claim window is below the policy minimum");
  }
  if (validated.evmRefundTime <= validated.evmClaimSafetyCutoff + 1n) {
    throw new RangeError("EVM claim and refund deadlines must leave an excluded safety gap");
  }
  if (validated.zecRefundTime - validated.evmRefundTime < safetyWindow) {
    throw new RangeError("Cross-chain safety window is below the policy minimum");
  }
  return validated;
}

export function hashSwapTimingPolicy(policy: SwapTimingPolicy): Hex32 {
  const fundingWindow = positiveUint64(policy.minimumFundingWindowSeconds, "Minimum funding window");
  const claimWindow = positiveUint64(policy.minimumClaimWindowSeconds, "Minimum claim window");
  const safetyWindow = positiveUint64(policy.minimumSafetyWindowSeconds, "Minimum safety window");
  return sha256Hex([
    "PhlebasSwapTimingPolicy",
    "version=1",
    `minimumFundingWindowSeconds=${fundingWindow}`,
    `minimumClaimWindowSeconds=${claimWindow}`,
    `minimumSafetyWindowSeconds=${safetyWindow}`,
  ].join("\n"));
}

export function swapDeadlineStatus(terms: SwapTermsV1, nowSeconds: bigint): SwapDeadlineStatus {
  if (typeof nowSeconds !== "bigint") throw new TypeError("Current time must be a bigint");
  if (nowSeconds < 0n || nowSeconds > UINT64_MAX) throw new RangeError("Current time must fit uint64");
  const validated = validateSwapTerms(terms);
  return {
    authorizationOpen: nowSeconds < validated.authorizationDeadline,
    zecFundingOpen: nowSeconds < validated.zecFundBy,
    evmFundingOpen: nowSeconds < validated.evmFundBy,
    evmClaimSafe: nowSeconds < validated.evmClaimSafetyCutoff,
    evmRefundEligible: nowSeconds >= validated.evmRefundTime,
    zecRefundEligible: nowSeconds >= validated.zecRefundTime,
  };
}
