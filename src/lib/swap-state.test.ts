import assert from "node:assert/strict";
import test from "node:test";

import { keccak256Text } from "./keccak.ts";
import { hashSwapTerms } from "./swap-domain.ts";
import { sampleSwapTerms } from "./swap-domain.test.ts";
import {
  authorizeSwapTerms,
  confirmSwapFunding,
  createSwapState,
  observeSwapFunding,
  prepareSwapFunding,
  swapPhase,
  type FundingEvidence,
  type SwapState,
} from "./swap-state.ts";

export const sampleTimingPolicy = {
  minimumFundingWindowSeconds: 100n,
  minimumClaimWindowSeconds: 100n,
  minimumSafetyWindowSeconds: 500n,
};

export function authorizedSwap(): SwapState {
  const created = createSwapState(sampleSwapTerms, sampleTimingPolicy);
  const first = authorizeSwapTerms(created, sampleSwapTerms.zecSellerId, created.termsHash, sampleSwapTerms.authorizationDeadline - 2n);
  return authorizeSwapTerms(first, sampleSwapTerms.stablecoinSellerId, first.termsHash, sampleSwapTerms.authorizationDeadline - 1n);
}

export function fundingEvidence(leg: "zec" | "evm", suffix = "1"): FundingEvidence {
  return {
    evidenceId: keccak256Text(`${leg}-evidence-${suffix}`),
    leg,
    transactionId: keccak256Text(`${leg}-transaction-${suffix}`),
    blockHash: keccak256Text(`${leg}-block-${suffix}`),
    blockHeight: 100n,
    outputIndex: 0n,
    sourceId: keccak256Text("fixture-observer"),
    observedAtSeconds: sampleSwapTerms.zecFundBy - 1n,
    chain: leg === "zec" ? sampleSwapTerms.zecChain : sampleSwapTerms.quoteChain,
    asset: leg === "zec" ? sampleSwapTerms.zecAsset : sampleSwapTerms.quoteAsset,
    amountAtoms: leg === "zec" ? sampleSwapTerms.zecAmountZatoshis : sampleSwapTerms.quoteAmountAtoms,
    lockIdentity: leg === "zec" ? sampleSwapTerms.zcashLockScriptHash : sampleSwapTerms.evmEscrowContract,
    recipient: leg === "zec" ? sampleSwapTerms.zcashClaimPubKeyHash : sampleSwapTerms.evmClaimRecipient,
  };
}

export function fundedZecSwap(): SwapState {
  const prepared = prepareSwapFunding(authorizedSwap(), "zec", keccak256Text("zec-artifact"), sampleSwapTerms.zecFundBy - 1n);
  const observed = observeSwapFunding(prepared, fundingEvidence("zec"));
  return confirmSwapFunding(observed, "zec", fundingEvidence("zec").evidenceId);
}

test("requires both exact terms authorizations before ZEC funding", () => {
  const created = createSwapState(sampleSwapTerms, sampleTimingPolicy);
  assert.equal(swapPhase(created), "awaiting-authorizations");
  assert.throws(() => prepareSwapFunding(created, "zec", keccak256Text("artifact"), 1n), /Both parties/);
  assert.throws(
    () => authorizeSwapTerms(created, sampleSwapTerms.zecSellerId, keccak256Text("wrong"), 1n),
    /does not match/,
  );
  assert.throws(
    () => authorizeSwapTerms(created, sampleSwapTerms.zecSellerId, hashSwapTerms(sampleSwapTerms), sampleSwapTerms.authorizationDeadline),
    /deadline/,
  );
  const once = authorizeSwapTerms(created, sampleSwapTerms.zecSellerId, created.termsHash, 1n);
  assert.equal(authorizeSwapTerms(once, sampleSwapTerms.zecSellerId, created.termsHash, 2n), once);
});

test("enforces ZEC-first funding and exact evidence", () => {
  const authorized = authorizedSwap();
  assert.equal(swapPhase(authorized), "awaiting-zec-funding");
  assert.throws(() => prepareSwapFunding(authorized, "evm", keccak256Text("evm-artifact"), 1n), /confirmed ZEC/);
  const prepared = prepareSwapFunding(authorized, "zec", keccak256Text("zec-artifact"), sampleSwapTerms.zecFundBy - 1n);
  assert.throws(() => observeSwapFunding(prepared, { ...fundingEvidence("zec"), amountAtoms: 1n }), /amountAtoms/);
  assert.deepEqual(prepared.zec, { phase: "funding-prepared", fundingArtifactHash: keccak256Text("zec-artifact") });
  const observed = observeSwapFunding(prepared, fundingEvidence("zec"));
  assert.equal(swapPhase(observed), "awaiting-zec-confirmation");
  assert.throws(() => confirmSwapFunding(observed, "zec", keccak256Text("wrong")), /does not match/);
  const confirmed = confirmSwapFunding(observed, "zec", fundingEvidence("zec").evidenceId);
  assert.equal(swapPhase(confirmed), "awaiting-evm-funding");
});

test("funds the EVM leg only inside its safe window", () => {
  const zecFunded = fundedZecSwap();
  assert.throws(
    () => prepareSwapFunding(zecFunded, "evm", keccak256Text("evm-artifact"), sampleSwapTerms.evmFundBy),
    /window has closed/,
  );
  const prepared = prepareSwapFunding(zecFunded, "evm", keccak256Text("evm-artifact"), sampleSwapTerms.evmFundBy - 1n);
  const observed = observeSwapFunding(prepared, fundingEvidence("evm"));
  assert.equal(swapPhase(observed), "awaiting-evm-confirmation");
  const confirmed = confirmSwapFunding(observed, "evm", fundingEvidence("evm").evidenceId);
  assert.equal(swapPhase(confirmed), "awaiting-evm-claim");
});
