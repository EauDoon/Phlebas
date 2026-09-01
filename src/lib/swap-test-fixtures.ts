import { keccak256Text } from "./keccak.ts";
import type { Hex32 } from "./order-domain.ts";
import {
  deriveSwapFillId,
  hashSwapMarketPolicy,
  type SwapMarketPolicyV1,
  type SwapTermsV1,
} from "./swap-domain.ts";
import {
  hashSwapFinalityPolicy,
  hashSwapObserverPolicy,
  hashSwapTimingPolicy,
  type SwapEvidencePolicies,
} from "./swap-policy.ts";
import {
  authorizeSwapTerms,
  confirmSwapFunding,
  createSwapState,
  fundingFactId,
  observeSwapFunding,
  prepareSwapFunding,
  spendFactId,
  type FundingEvidence,
  type SpendEvidence,
  type SwapState,
} from "./swap-state.ts";

export const hex20 = (byte: string) => `0x${byte.repeat(40)}` as `0x${string}`;

const sampleZecChain = "bip122:00040fe8ec8471911baa1db1266ea15d";
const sampleQuoteChain = "eip155:421614";
const sampleObserverSourceIds = [keccak256Text("fixture-observer-a"), keccak256Text("fixture-observer-b")]
  .sort() as Hex32[];

export const sampleMarketPolicy: SwapMarketPolicyV1 = {
  version: 1,
  markets: [{
    zecChain: sampleZecChain,
    zecAsset: `${sampleZecChain}/slip44:133`,
    quoteChain: sampleQuoteChain,
    quoteAsset: `${sampleQuoteChain}/erc20:0x1111111111111111111111111111111111111111`,
  }],
};

export const sampleEvidencePolicies: SwapEvidencePolicies = {
  observer: {
    version: 1,
    sourceIds: sampleObserverSourceIds,
    requiredSourceCount: 2n,
    maxObservationDelaySeconds: 600n,
  },
  zecFinality: {
    version: 1,
    chain: sampleZecChain,
    minimumConfirmations: 10n,
    minimumAgeSeconds: 60n,
  },
  evmFinality: {
    version: 1,
    chain: sampleQuoteChain,
    minimumConfirmations: 20n,
    minimumAgeSeconds: 30n,
  },
};

export const sampleTimingPolicy = {
  minimumFundingWindowSeconds: 100n,
  minimumClaimWindowSeconds: 100n,
  minimumSafetyWindowSeconds: 500n,
};

const sampleZecOrderHash = keccak256Text("zec-order");
const sampleStablecoinOrderHash = keccak256Text("stablecoin-order");
const sampleFillFields = {
  zecOrderHash: sampleZecOrderHash,
  stablecoinOrderHash: sampleStablecoinOrderHash,
  fillIndex: 0n,
  zecAmountZatoshis: 100_000_000n,
  quoteAmountAtoms: 52_910_000n,
  executionPriceTicks: 5_291n,
};

export const sampleSwapTerms: SwapTermsV1 = {
  version: 1,
  fillId: deriveSwapFillId(sampleFillFields),
  ...sampleFillFields,
  zecSellerId: keccak256Text("zec-seller"),
  stablecoinSellerId: keccak256Text("stablecoin-seller"),
  zecChain: sampleZecChain,
  zecAsset: `${sampleZecChain}/slip44:133`,
  quoteChain: sampleQuoteChain,
  quoteAsset: "eip155:421614/erc20:0x1111111111111111111111111111111111111111",
  protocolFeeQuoteAtoms: 0n,
  feeRecipient: hex20("7"),
  maximumFeeBps: 30n,
  zcashLockScriptHash: hex20("a"),
  zcashClaimPubKeyHash: hex20("1"),
  zcashRefundPubKeyHash: hex20("2"),
  evmFunder: hex20("3"),
  evmClaimRecipient: hex20("4"),
  evmRefundRecipient: hex20("5"),
  evmEscrowContract: hex20("6"),
  secretHash: keccak256Text("fixture-sha256-value"),
  authorizationDeadline: 1_700_000_100n,
  zecFundBy: 1_700_000_200n,
  evmFundBy: 1_700_000_300n,
  evmClaimSafetyCutoff: 1_700_000_400n,
  evmRefundTime: 1_700_000_500n,
  zecRefundTime: 1_700_001_000n,
  timeoutPolicyId: hashSwapTimingPolicy(sampleTimingPolicy),
  marketPolicyId: hashSwapMarketPolicy(sampleMarketPolicy),
  observerPolicyId: hashSwapObserverPolicy(sampleEvidencePolicies.observer),
  zecFinalityPolicyId: hashSwapFinalityPolicy(sampleEvidencePolicies.zecFinality),
  evmFinalityPolicyId: hashSwapFinalityPolicy(sampleEvidencePolicies.evmFinality),
};

export const fixturePreimage = `0x${"42".repeat(32)}` as const;
export const fixtureSecretHash = "0x425ed4e4a36b30ea21b90e21c712c649e8214c29b7eaf68089d1039c6e55384c" as const;

export function authorizedSwap(terms = sampleSwapTerms): SwapState {
  const created = createSwapState(terms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy);
  const first = authorizeSwapTerms(created, terms.zecSellerId, created.termsHash, terms.authorizationDeadline - 2n);
  return authorizeSwapTerms(first, terms.stablecoinSellerId, first.termsHash, terms.authorizationDeadline - 1n);
}

export function fundingEvidence(
  leg: "zec" | "evm",
  suffix = "1",
  terms = sampleSwapTerms,
  observerIndex: 0 | 1 = 0,
): FundingEvidence {
  const blockHeight = 100n;
  const executedAtSeconds = (leg === "zec" ? terms.zecFundBy : terms.evmFundBy) - 1n;
  const unsigned = {
    leg,
    swapId: createSwapState(terms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy).swapId,
    termsHash: createSwapState(terms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy).termsHash,
    transactionId: keccak256Text(`${leg}-transaction-${suffix}`),
    blockHash: keccak256Text(`${leg}-block-${suffix}`),
    blockHeight,
    executedAtSeconds,
    outputIndex: 0n,
    chain: leg === "zec" ? terms.zecChain : terms.quoteChain,
    asset: leg === "zec" ? terms.zecAsset : terms.quoteAsset,
    amountAtoms: leg === "zec" ? terms.zecAmountZatoshis : terms.quoteAmountAtoms,
    lockIdentity: leg === "zec" ? terms.zcashLockScriptHash : terms.evmEscrowContract,
    escrowRecordId: createSwapState(terms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy).swapId,
    funder: leg === "zec" ? terms.zecSellerId : terms.evmFunder,
    claimRecipient: leg === "zec" ? terms.zcashClaimPubKeyHash : terms.evmClaimRecipient,
    refundRecipient: leg === "zec" ? terms.zcashRefundPubKeyHash : terms.evmRefundRecipient,
    secretHash: terms.secretHash,
    refundTime: leg === "zec" ? terms.zecRefundTime : terms.evmRefundTime,
    successful: true,
  } as const;
  const fact = { factId: fundingFactId(unsigned), ...unsigned };
  const sourceId = sampleEvidencePolicies.observer.sourceIds[observerIndex]!;
  const finality = leg === "zec" ? sampleEvidencePolicies.zecFinality : sampleEvidencePolicies.evmFinality;
  return {
    fact,
    attestation: {
      evidenceId: keccak256Text(`${leg}-evidence-${suffix}-${observerIndex}`),
      factId: fact.factId,
      sourceId,
      observerPolicyId: terms.observerPolicyId,
      finalityPolicyId: leg === "zec" ? terms.zecFinalityPolicyId : terms.evmFinalityPolicyId,
      observedAtSeconds: executedAtSeconds + finality.minimumAgeSeconds,
      tipBlockHash: keccak256Text(`${leg}-tip-${suffix}`),
      tipBlockHeight: blockHeight + finality.minimumConfirmations - 1n,
    },
  };
}

export function fundedZecSwap(terms = sampleSwapTerms): SwapState {
  const prepared = prepareSwapFunding(authorizedSwap(terms), "zec", keccak256Text("zec-artifact"), terms.zecFundBy - 1n);
  const first = fundingEvidence("zec", "1", terms, 0);
  const second = fundingEvidence("zec", "1", terms, 1);
  const observed = observeSwapFunding(observeSwapFunding(prepared, first), second);
  return confirmSwapFunding(observed, "zec", first.fact.factId, first.attestation.observedAtSeconds);
}

export function fundedSwap(terms = sampleSwapTerms): SwapState {
  const zecFunded = fundedZecSwap(terms);
  const prepared = prepareSwapFunding(zecFunded, "evm", keccak256Text("evm-artifact"), terms.evmFundBy - 1n);
  const first = fundingEvidence("evm", "1", terms, 0);
  const second = fundingEvidence("evm", "1", terms, 1);
  const observed = observeSwapFunding(observeSwapFunding(prepared, first), second);
  return confirmSwapFunding(observed, "evm", first.fact.factId, first.attestation.observedAtSeconds);
}

export function spendEvidence(
  leg: "zec" | "evm",
  action: "claim" | "refund",
  executedAtSeconds: bigint,
  terms = sampleSwapTerms,
  observerIndex: 0 | 1 = 0,
): SpendEvidence {
  const funding = fundingEvidence(leg, "1", terms).fact;
  const blockHeight = 200n;
  const unsigned = {
    fundingFactId: funding.factId,
    fundingTransactionId: funding.transactionId,
    fundingOutputIndex: funding.outputIndex,
    leg,
    action,
    swapId: funding.swapId,
    termsHash: funding.termsHash,
    transactionId: keccak256Text(`${leg}-${action}-transaction`),
    blockHash: keccak256Text(`${leg}-${action}-block`),
    blockHeight,
    executedAtSeconds,
    inputOrLogIndex: 0n,
    chain: leg === "zec" ? terms.zecChain : terms.quoteChain,
    asset: leg === "zec" ? terms.zecAsset : terms.quoteAsset,
    amountAtoms: leg === "zec" ? terms.zecAmountZatoshis : terms.quoteAmountAtoms,
    lockIdentity: leg === "zec" ? terms.zcashLockScriptHash : terms.evmEscrowContract,
    escrowRecordId: funding.escrowRecordId,
    recipient: leg === "zec"
      ? (action === "claim" ? terms.zcashClaimPubKeyHash : terms.zcashRefundPubKeyHash)
      : (action === "claim" ? terms.evmClaimRecipient : terms.evmRefundRecipient),
    successful: true,
    ...(action === "claim" ? { preimage: fixturePreimage } : {}),
  } as const;
  const fact = { factId: spendFactId(unsigned), ...unsigned };
  const finality = leg === "zec" ? sampleEvidencePolicies.zecFinality : sampleEvidencePolicies.evmFinality;
  return {
    fact,
    attestation: {
      evidenceId: keccak256Text(`${leg}-${action}-evidence-${observerIndex}`),
      factId: fact.factId,
      sourceId: sampleEvidencePolicies.observer.sourceIds[observerIndex]!,
      observerPolicyId: terms.observerPolicyId,
      finalityPolicyId: leg === "zec" ? terms.zecFinalityPolicyId : terms.evmFinalityPolicyId,
      observedAtSeconds: executedAtSeconds + finality.minimumAgeSeconds,
      tipBlockHash: keccak256Text(`${leg}-${action}-tip`),
      tipBlockHeight: blockHeight + finality.minimumConfirmations - 1n,
    },
  };
}
