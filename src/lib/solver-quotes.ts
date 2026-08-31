import type { TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import { type MatcherSignatureVerifier } from "./matcher-auth.ts";
import {
  MAX_ORDER_FEE_BPS,
  UINT64_MAX,
  UINT256_MAX,
  accountIdentifier,
  adapterIdentifier,
  assetIdentifier,
  chainIdentifier,
  normalizeHex32,
  type Hex32,
} from "./order-domain.ts";
import { VENUE_SOLVER } from "./order-policy.ts";

export const SOLVER_QUOTE_VERSION = 1;

export type SolverPricePolicy =
  | Readonly<{ kind: "fixed"; priceTicks: bigint }>
  | Readonly<{
    kind: "curve";
    levels: readonly Readonly<{ cumulativeBaseAtoms: bigint; priceTicks: bigint }>[];
  }>;

export type SolverQuote = Readonly<{
  version: typeof SOLVER_QUOTE_VERSION;
  matcherDomainHash: Hex32;
  solverAccountId: Hex32;
  authorizedSignerId: Hex32;
  recipientAccountId: Hex32;
  sourceAccount: string;
  recipientAccount: string;
  baseNetwork: string;
  baseAsset: string;
  quoteNetwork: string;
  quoteAsset: string;
  side: 0 | 1;
  capacityBaseAtoms: bigint;
  minimumFillBaseAtoms: bigint;
  pricePolicy: SolverPricePolicy;
  maximumSlippageBps: bigint;
  feeBps: bigint;
  nonce: bigint;
  expirySeconds: bigint;
  settlementProtocolVersion: string;
}>;

export type SolverQuotePolicy = Readonly<{
  matcherDomainHash: Hex32;
  baseNetwork: string;
  baseAsset: string;
  quoteNetwork: string;
  quoteAsset: string;
  settlementProtocolVersion: string;
  maximumCapacityBaseAtoms: bigint;
  maximumLifetimeSeconds: bigint;
  maximumFeeBps?: bigint;
  maximumSlippageBps?: bigint;
}>;

export type AcceptedSolverQuote = Readonly<{
  quoteHash: Hex32;
  acceptedSequence: bigint;
  acceptedAtSeconds: bigint;
  remainingCapacityBaseAtoms: bigint;
  signature: string;
  quote: SolverQuote;
}>;

export type SolverMarginalLevel = Readonly<{
  quoteHash: Hex32;
  acceptedSequence: bigint;
  availableBaseAtoms: bigint;
  priceTicks: bigint;
  feeBps: bigint;
}>;

function assertUint(value: bigint, maximum: bigint, label: string, positive = false): void {
  if (typeof value !== "bigint" || value < (positive ? 1n : 0n) || value > maximum) {
    throw new RangeError(`${label} is outside its allowed integer range`);
  }
}

function assertCanonicalPair(quote: SolverQuote, policy: SolverQuotePolicy): void {
  if (quote.baseNetwork !== policy.baseNetwork || quote.baseAsset !== policy.baseAsset
    || quote.quoteNetwork !== policy.quoteNetwork || quote.quoteAsset !== policy.quoteAsset) {
    throw new Error("Solver quote does not bind the configured exact asset pair");
  }
  if (!quote.baseAsset.startsWith(`${quote.baseNetwork}/`) || !quote.quoteAsset.startsWith(`${quote.quoteNetwork}/`)) {
    throw new Error("Solver quote asset is not on its declared network");
  }
  chainIdentifier(quote.baseNetwork);
  assetIdentifier(quote.baseAsset);
  chainIdentifier(quote.quoteNetwork);
  assetIdentifier(quote.quoteAsset);
}

function quoteLevels(quote: SolverQuote): readonly Readonly<{ cumulativeBaseAtoms: bigint; priceTicks: bigint }>[] {
  if (quote.pricePolicy.kind === "fixed") {
    assertUint(quote.pricePolicy.priceTicks, UINT256_MAX, "Solver fixed price", true);
    return [{ cumulativeBaseAtoms: quote.capacityBaseAtoms, priceTicks: quote.pricePolicy.priceTicks }];
  }
  if (quote.pricePolicy.levels.length === 0 || quote.pricePolicy.levels.length > 64) {
    throw new RangeError("Solver curve must contain 1 to 64 levels");
  }
  let priorCapacity = 0n;
  let priorPrice: bigint | undefined;
  for (const level of quote.pricePolicy.levels) {
    assertUint(level.cumulativeBaseAtoms, UINT256_MAX, "Solver curve capacity", true);
    assertUint(level.priceTicks, UINT256_MAX, "Solver curve price", true);
    if (level.cumulativeBaseAtoms <= priorCapacity) throw new Error("Solver curve capacities must increase strictly");
    if (priorPrice !== undefined) {
      if (quote.side === 1 && level.priceTicks < priorPrice) throw new Error("Solver sell curve prices must not decrease");
      if (quote.side === 0 && level.priceTicks > priorPrice) throw new Error("Solver buy curve prices must not increase");
    }
    priorCapacity = level.cumulativeBaseAtoms;
    priorPrice = level.priceTicks;
  }
  if (priorCapacity !== quote.capacityBaseAtoms) throw new Error("Solver curve must end at the advertised capacity");
  return quote.pricePolicy.levels;
}

function assertCurveSlippage(quote: SolverQuote, levels: readonly Readonly<{ priceTicks: bigint }>[]): void {
  const first = levels[0]?.priceTicks;
  const last = levels.at(-1)?.priceTicks;
  if (first === undefined || last === undefined) throw new Error("Solver price policy has no levels");
  const deterioration = quote.side === 1 ? last - first : first - last;
  if (deterioration * 10_000n > first * quote.maximumSlippageBps) {
    throw new Error("Solver curve exceeds its signed maximum slippage");
  }
}

export function assertSolverQuote(quote: SolverQuote, policy: SolverQuotePolicy, nowSeconds: bigint): void {
  if (quote.version !== SOLVER_QUOTE_VERSION) throw new Error("Solver quote version is unsupported");
  if (normalizeHex32(quote.matcherDomainHash, "Solver matcher domain hash")
    !== normalizeHex32(policy.matcherDomainHash, "Configured matcher domain hash")) {
    throw new Error("Solver quote does not bind the configured matcher domain");
  }
  if (quote.side !== 0 && quote.side !== 1) throw new RangeError("Solver quote side is invalid");
  assertCanonicalPair(quote, policy);
  if (quote.settlementProtocolVersion !== policy.settlementProtocolVersion
    || adapterIdentifier(quote.settlementProtocolVersion) !== adapterIdentifier(policy.settlementProtocolVersion)) {
    throw new Error("Solver quote settlement protocol is not allowed");
  }
  if (accountIdentifier(quote.sourceAccount) !== normalizeHex32(quote.solverAccountId, "Solver account ID")) {
    throw new Error("Solver source account does not match its account ID");
  }
  if (accountIdentifier(quote.recipientAccount) !== normalizeHex32(quote.recipientAccountId, "Solver recipient account ID")) {
    throw new Error("Solver recipient account does not match its account ID");
  }
  normalizeHex32(quote.authorizedSignerId, "Solver authorized signer ID");
  assertUint(policy.maximumCapacityBaseAtoms, UINT256_MAX, "Maximum solver capacity", true);
  assertUint(quote.capacityBaseAtoms, policy.maximumCapacityBaseAtoms, "Solver capacity", true);
  assertUint(quote.minimumFillBaseAtoms, quote.capacityBaseAtoms, "Solver minimum fill", true);
  assertUint(quote.nonce, UINT64_MAX, "Solver quote nonce");
  assertUint(nowSeconds, UINT64_MAX, "Solver quote acceptance time");
  assertUint(quote.expirySeconds, UINT64_MAX, "Solver quote expiry", true);
  assertUint(policy.maximumLifetimeSeconds, UINT64_MAX, "Maximum solver quote lifetime", true);
  if (quote.expirySeconds <= nowSeconds || quote.expirySeconds > nowSeconds + policy.maximumLifetimeSeconds) {
    throw new Error("Solver quote expiry is stale or exceeds the maximum lifetime");
  }
  const maximumFee = policy.maximumFeeBps ?? MAX_ORDER_FEE_BPS;
  const maximumSlippage = policy.maximumSlippageBps ?? 2_000n;
  assertUint(maximumFee, 10_000n, "Maximum solver fee");
  assertUint(maximumSlippage, 10_000n, "Maximum solver slippage");
  assertUint(quote.feeBps, maximumFee, "Solver fee");
  assertUint(quote.maximumSlippageBps, maximumSlippage, "Solver slippage");
  assertCurveSlippage(quote, quoteLevels(quote));
}

function quotePayload(quote: SolverQuote): string {
  const prices = quoteLevels(quote).map((level) => `${level.cumulativeBaseAtoms}@${level.priceTicks}`).join(",");
  return [
    "PhlebasSolverQuote",
    `version=${quote.version}`,
    `matcherDomainHash=${normalizeHex32(quote.matcherDomainHash, "Solver matcher domain hash")}`,
    `solverAccountId=${normalizeHex32(quote.solverAccountId, "Solver account ID")}`,
    `authorizedSignerId=${normalizeHex32(quote.authorizedSignerId, "Solver authorized signer ID")}`,
    `recipientAccountId=${normalizeHex32(quote.recipientAccountId, "Solver recipient account ID")}`,
    `sourceAccount=${quote.sourceAccount}`,
    `recipientAccount=${quote.recipientAccount}`,
    `baseNetwork=${quote.baseNetwork}`,
    `baseAsset=${quote.baseAsset}`,
    `quoteNetwork=${quote.quoteNetwork}`,
    `quoteAsset=${quote.quoteAsset}`,
    `side=${quote.side}`,
    `capacityBaseAtoms=${quote.capacityBaseAtoms}`,
    `minimumFillBaseAtoms=${quote.minimumFillBaseAtoms}`,
    `pricePolicy=${quote.pricePolicy.kind}:${prices}`,
    `maximumSlippageBps=${quote.maximumSlippageBps}`,
    `feeBps=${quote.feeBps}`,
    `nonce=${quote.nonce}`,
    `expirySeconds=${quote.expirySeconds}`,
    `settlementProtocolVersion=${quote.settlementProtocolVersion}`,
  ].join("\n");
}

export function hashSolverQuote(quote: SolverQuote): Hex32 {
  return keccak256Text(quotePayload(quote));
}

export function acceptSolverQuote(
  quote: SolverQuote,
  signature: string,
  acceptedSequence: bigint,
  nowSeconds: bigint,
  policy: SolverQuotePolicy,
  verifier: MatcherSignatureVerifier,
): AcceptedSolverQuote {
  assertSolverQuote(quote, policy, nowSeconds);
  assertUint(acceptedSequence, UINT64_MAX, "Solver quote acceptance sequence", true);
  const quoteHash = hashSolverQuote(quote);
  verifier.verify(quoteHash, signature, normalizeHex32(quote.authorizedSignerId, "Solver authorized signer ID"));
  return Object.freeze({
    quoteHash,
    acceptedSequence,
    acceptedAtSeconds: nowSeconds,
    remainingCapacityBaseAtoms: quote.capacityBaseAtoms,
    signature,
    quote: Object.freeze({ ...quote }),
  });
}

export function activeSolverLevels(accepted: AcceptedSolverQuote, nowSeconds: bigint): SolverMarginalLevel[] {
  assertUint(nowSeconds, UINT64_MAX, "Solver quote evaluation time");
  if (accepted.remainingCapacityBaseAtoms <= 0n || accepted.quote.expirySeconds <= nowSeconds) return [];
  const consumed = accepted.quote.capacityBaseAtoms - accepted.remainingCapacityBaseAtoms;
  if (consumed < 0n) throw new Error("Solver remaining capacity exceeds its signed capacity");
  const result: SolverMarginalLevel[] = [];
  let priorCumulative = 0n;
  for (const level of quoteLevels(accepted.quote)) {
    const levelCapacity = level.cumulativeBaseAtoms - priorCumulative;
    const consumedFromLevel = consumed > priorCumulative
      ? (consumed - priorCumulative < levelCapacity ? consumed - priorCumulative : levelCapacity)
      : 0n;
    const available = levelCapacity - consumedFromLevel;
    if (available > 0n) {
      result.push({
        quoteHash: accepted.quoteHash,
        acceptedSequence: accepted.acceptedSequence,
        availableBaseAtoms: available,
        priceTicks: level.priceTicks,
        feeBps: accepted.quote.feeBps,
      });
    }
    priorCumulative = level.cumulativeBaseAtoms;
  }
  const total = result.reduce((sum, level) => sum + level.availableBaseAtoms, 0n);
  if (total !== accepted.remainingCapacityBaseAtoms) throw new Error("Solver curve capacity does not match remaining inventory");
  return result;
}

export function consumeSolverCapacity(accepted: AcceptedSolverQuote, baseAmountAtoms: bigint): AcceptedSolverQuote {
  assertUint(baseAmountAtoms, accepted.remainingCapacityBaseAtoms, "Solver capacity consumption", true);
  if (baseAmountAtoms < accepted.quote.minimumFillBaseAtoms && baseAmountAtoms !== accepted.remainingCapacityBaseAtoms) {
    throw new Error("Solver fill is below the signed minimum");
  }
  return { ...accepted, remainingCapacityBaseAtoms: accepted.remainingCapacityBaseAtoms - baseAmountAtoms };
}

export function solverQuoteAsOrder(
  accepted: AcceptedSolverQuote,
  executionPriceTicks: bigint,
): TypedOrderIntent {
  assertUint(executionPriceTicks, UINT256_MAX, "Solver execution price", true);
  return {
    makerAccountId: accepted.quote.solverAccountId,
    authorizedSignerId: accepted.quote.authorizedSignerId,
    recipientAccountId: accepted.quote.recipientAccountId,
    baseChainId: chainIdentifier(accepted.quote.baseNetwork),
    baseAssetId: assetIdentifier(accepted.quote.baseAsset),
    quoteChainId: chainIdentifier(accepted.quote.quoteNetwork),
    quoteAssetId: assetIdentifier(accepted.quote.quoteAsset),
    side: accepted.quote.side,
    baseAmountAtoms: accepted.quote.capacityBaseAtoms,
    limitPriceTicks: executionPriceTicks,
    nonce: accepted.quote.nonce,
    accountEpoch: 0n,
    expiry: accepted.quote.expirySeconds,
    salt: accepted.quoteHash,
    timeInForce: 0,
    maximumFeeBps: accepted.quote.feeBps,
    allowedVenues: VENUE_SOLVER,
    settlementAdapterId: adapterIdentifier(accepted.quote.settlementProtocolVersion),
  };
}
