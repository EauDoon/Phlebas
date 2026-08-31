import { keccak256Text } from "./keccak.ts";
import type { SwapTermsV1 } from "./swap-domain.ts";
import {
  authorizeSwapTerms,
  confirmSwapFunding,
  createSwapState,
  observeSwapFunding,
  prepareSwapFunding,
  type FundingEvidence,
  type SpendEvidence,
  type SwapState,
} from "./swap-state.ts";

export const hex20 = (byte: string) => `0x${byte.repeat(40)}` as `0x${string}`;

export const sampleSwapTerms: SwapTermsV1 = {
  version: 1,
  fillId: keccak256Text("fill-1"),
  fillIndex: 0n,
  zecOrderHash: keccak256Text("zec-order"),
  stablecoinOrderHash: keccak256Text("stablecoin-order"),
  zecSellerId: keccak256Text("zec-seller"),
  stablecoinSellerId: keccak256Text("stablecoin-seller"),
  zecChain: "bip122:00040fe8ec8471911baa1db1266ea15d",
  zecAsset: "bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133",
  quoteChain: "eip155:421614",
  quoteAsset: "eip155:421614/erc20:0x1111111111111111111111111111111111111111",
  zecAmountZatoshis: 100_000_000n,
  quoteAmountAtoms: 5_291_000n,
  executionPriceTicks: 5_291n,
  protocolFeeQuoteAtoms: 7_936n,
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
  timeoutPolicyId: keccak256Text("timeout-policy-fixture-v1"),
  observerPolicyId: keccak256Text("observer-policy-fixture-v1"),
  zecFinalityPolicyId: keccak256Text("zec-finality-fixture-v1"),
  evmFinalityPolicyId: keccak256Text("evm-finality-fixture-v1"),
};

export const sampleTimingPolicy = {
  minimumFundingWindowSeconds: 100n,
  minimumClaimWindowSeconds: 100n,
  minimumSafetyWindowSeconds: 500n,
};

export const fixturePreimage = `0x${"42".repeat(32)}` as const;
export const fixtureSecretHash = "0x425ed4e4a36b30ea21b90e21c712c649e8214c29b7eaf68089d1039c6e55384c" as const;

export function authorizedSwap(terms = sampleSwapTerms): SwapState {
  const created = createSwapState(terms, sampleTimingPolicy);
  const first = authorizeSwapTerms(created, terms.zecSellerId, created.termsHash, terms.authorizationDeadline - 2n);
  return authorizeSwapTerms(first, terms.stablecoinSellerId, first.termsHash, terms.authorizationDeadline - 1n);
}

export function fundingEvidence(leg: "zec" | "evm", suffix = "1", terms = sampleSwapTerms): FundingEvidence {
  return {
    evidenceId: keccak256Text(`${leg}-evidence-${suffix}`),
    leg,
    transactionId: keccak256Text(`${leg}-transaction-${suffix}`),
    blockHash: keccak256Text(`${leg}-block-${suffix}`),
    blockHeight: 100n,
    outputIndex: 0n,
    sourceId: keccak256Text("fixture-observer"),
    observedAtSeconds: terms.zecFundBy - 1n,
    chain: leg === "zec" ? terms.zecChain : terms.quoteChain,
    asset: leg === "zec" ? terms.zecAsset : terms.quoteAsset,
    amountAtoms: leg === "zec" ? terms.zecAmountZatoshis : terms.quoteAmountAtoms,
    lockIdentity: leg === "zec" ? terms.zcashLockScriptHash : terms.evmEscrowContract,
    recipient: leg === "zec" ? terms.zcashClaimPubKeyHash : terms.evmClaimRecipient,
  };
}

export function fundedZecSwap(terms = sampleSwapTerms): SwapState {
  const prepared = prepareSwapFunding(authorizedSwap(terms), "zec", keccak256Text("zec-artifact"), terms.zecFundBy - 1n);
  const evidence = fundingEvidence("zec", "1", terms);
  return confirmSwapFunding(observeSwapFunding(prepared, evidence), "zec", evidence.evidenceId);
}

export function fundedSwap(terms = sampleSwapTerms): SwapState {
  const zecFunded = fundedZecSwap(terms);
  const prepared = prepareSwapFunding(zecFunded, "evm", keccak256Text("evm-artifact"), terms.evmFundBy - 1n);
  const evidence = fundingEvidence("evm", "1", terms);
  return confirmSwapFunding(observeSwapFunding(prepared, evidence), "evm", evidence.evidenceId);
}

export function spendEvidence(
  leg: "zec" | "evm",
  action: "claim" | "refund",
  observedAtSeconds: bigint,
  terms = sampleSwapTerms,
): SpendEvidence {
  return {
    evidenceId: keccak256Text(`${leg}-${action}-evidence`),
    leg,
    action,
    transactionId: keccak256Text(`${leg}-${action}-transaction`),
    blockHash: keccak256Text(`${leg}-${action}-block`),
    blockHeight: 200n,
    inputOrLogIndex: 0n,
    sourceId: keccak256Text("fixture-observer"),
    observedAtSeconds,
    chain: leg === "zec" ? terms.zecChain : terms.quoteChain,
    recipient: leg === "zec"
      ? (action === "claim" ? terms.zcashClaimPubKeyHash : terms.zcashRefundPubKeyHash)
      : (action === "claim" ? terms.evmClaimRecipient : terms.evmRefundRecipient),
    successful: true,
    ...(action === "claim" ? { preimage: fixturePreimage } : {}),
  };
}
