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
  observeSwapSpend,
  prepareSwapFunding,
  confirmSwapSpend,
  flagSwapDispute,
  retractSwapEvidence,
  swapPhase,
  type FundingEvidence,
  type SpendEvidence,
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

export function fundedSwap(): SwapState {
  const zecFunded = fundedZecSwap();
  const prepared = prepareSwapFunding(zecFunded, "evm", keccak256Text("evm-artifact"), sampleSwapTerms.evmFundBy - 1n);
  const observed = observeSwapFunding(prepared, fundingEvidence("evm"));
  return confirmSwapFunding(observed, "evm", fundingEvidence("evm").evidenceId);
}

const fixturePreimage = `0x${"42".repeat(32)}` as const;

function spendEvidence(leg: "zec" | "evm", action: "claim" | "refund", observedAtSeconds: bigint): SpendEvidence {
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
    chain: leg === "zec" ? sampleSwapTerms.zecChain : sampleSwapTerms.quoteChain,
    recipient: leg === "zec"
      ? (action === "claim" ? sampleSwapTerms.zcashClaimPubKeyHash : sampleSwapTerms.zcashRefundPubKeyHash)
      : (action === "claim" ? sampleSwapTerms.evmClaimRecipient : sampleSwapTerms.evmRefundRecipient),
    successful: true,
    ...(action === "claim" ? { preimage: fixturePreimage } : {}),
  };
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

test("reveals the secret only from a successful canonical EVM claim", () => {
  const terms = { ...sampleSwapTerms, secretHash: "0x425ed4e4a36b30ea21b90e21c712c649e8214c29b7eaf68089d1039c6e55384c" as const };
  const created = createSwapState(terms, sampleTimingPolicy);
  const first = authorizeSwapTerms(created, terms.zecSellerId, created.termsHash, 1n);
  const authorized = authorizeSwapTerms(first, terms.stablecoinSellerId, created.termsHash, 2n);
  const zecPrepared = prepareSwapFunding(authorized, "zec", keccak256Text("zec-artifact"), terms.zecFundBy - 1n);
  const zecSeen = observeSwapFunding(zecPrepared, { ...fundingEvidence("zec"), amountAtoms: terms.zecAmountZatoshis });
  const zecConfirmed = confirmSwapFunding(zecSeen, "zec", fundingEvidence("zec").evidenceId);
  const evmPrepared = prepareSwapFunding(zecConfirmed, "evm", keccak256Text("evm-artifact"), terms.evmFundBy - 1n);
  const evmSeen = observeSwapFunding(evmPrepared, { ...fundingEvidence("evm"), amountAtoms: terms.quoteAmountAtoms });
  const bothFunded = confirmSwapFunding(evmSeen, "evm", fundingEvidence("evm").evidenceId);

  assert.throws(() => observeSwapSpend(bothFunded, { ...spendEvidence("evm", "claim", terms.evmRefundTime - 1n), successful: false }), /Failed/);
  assert.equal(bothFunded.secret, undefined);
  assert.throws(() => observeSwapSpend(bothFunded, { ...spendEvidence("evm", "claim", terms.evmRefundTime - 1n), preimage: `0x${"11".repeat(32)}` }), /hashlock/);
  const reveal = observeSwapSpend(bothFunded, spendEvidence("evm", "claim", terms.evmRefundTime - 1n));
  assert.equal(reveal.secret, fixturePreimage);
  assert.equal(swapPhase(reveal), "secret-observed");
  const evmClaimed = confirmSwapSpend(reveal, "evm", spendEvidence("evm", "claim", 1n).evidenceId);
  assert.equal(swapPhase(evmClaimed), "awaiting-zec-claim");
  const zecClaim = observeSwapSpend(evmClaimed, spendEvidence("zec", "claim", terms.zecRefundTime + 1n));
  const settled = confirmSwapSpend(zecClaim, "zec", spendEvidence("zec", "claim", 1n).evidenceId);
  assert.equal(swapPhase(settled), "settled");
});

test("keeps claim and refund mutually exclusive and rejects early refunds", () => {
  const bothFunded = fundedSwap();
  assert.throws(() => observeSwapSpend(bothFunded, spendEvidence("evm", "refund", sampleSwapTerms.evmRefundTime - 1n)), /not eligible/);
  const evmRefund = observeSwapSpend(bothFunded, spendEvidence("evm", "refund", sampleSwapTerms.evmRefundTime));
  assert.equal(swapPhase(evmRefund), "refund-recovery");
  assert.throws(() => observeSwapSpend(evmRefund, spendEvidence("evm", "claim", sampleSwapTerms.evmRefundTime - 1n)), /not available/);
  const evmRefunded = confirmSwapSpend(evmRefund, "evm", spendEvidence("evm", "refund", 1n).evidenceId);
  const zecRefund = observeSwapSpend(evmRefunded, spendEvidence("zec", "refund", sampleSwapTerms.zecRefundTime));
  const recovered = confirmSwapSpend(zecRefund, "zec", spendEvidence("zec", "refund", 1n).evidenceId);
  assert.equal(swapPhase(recovered), "refunded");
});

test("rejects EVM claims at the refund deadline", () => {
  const terms = { ...sampleSwapTerms, secretHash: "0x425ed4e4a36b30ea21b90e21c712c649e8214c29b7eaf68089d1039c6e55384c" as const };
  const created = createSwapState(terms, sampleTimingPolicy);
  const first = authorizeSwapTerms(created, terms.zecSellerId, created.termsHash, 1n);
  const authorized = authorizeSwapTerms(first, terms.stablecoinSellerId, created.termsHash, 2n);
  const zecPrepared = prepareSwapFunding(authorized, "zec", keccak256Text("za"), 3n);
  const zecSeen = observeSwapFunding(zecPrepared, fundingEvidence("zec"));
  const zecFunded = confirmSwapFunding(zecSeen, "zec", fundingEvidence("zec").evidenceId);
  const evmPrepared = prepareSwapFunding(zecFunded, "evm", keccak256Text("ea"), 4n);
  const evmSeen = observeSwapFunding(evmPrepared, fundingEvidence("evm"));
  const bothFunded = confirmSwapFunding(evmSeen, "evm", fundingEvidence("evm").evidenceId);
  assert.throws(() => observeSwapSpend(bothFunded, spendEvidence("evm", "claim", terms.evmRefundTime)), /at or after/);
});

test("fails closed on stale or conflicting observer evidence", () => {
  const bothFunded = fundedSwap();
  const stale = flagSwapDispute(bothFunded, "observer-stale", "Approved observer watermark is stale");
  assert.equal(swapPhase(stale), "disputed");
  assert.throws(() => observeSwapSpend(stale, spendEvidence("evm", "refund", sampleSwapTerms.evmRefundTime)), /disputed/);
  const same = flagSwapDispute(stale, "observer-stale", "Approved observer watermark is stale");
  assert.equal(same, stale);
  const conflict = flagSwapDispute(stale, "observer-conflict", "Observers disagree on the EVM funding outpoint");
  assert.equal(conflict.disputes.length, 2);
});

test("preserves a revealed secret when its EVM claim reorganizes", () => {
  const terms = { ...sampleSwapTerms, secretHash: "0x425ed4e4a36b30ea21b90e21c712c649e8214c29b7eaf68089d1039c6e55384c" as const };
  const created = createSwapState(terms, sampleTimingPolicy);
  const first = authorizeSwapTerms(created, terms.zecSellerId, created.termsHash, 1n);
  const authorized = authorizeSwapTerms(first, terms.stablecoinSellerId, created.termsHash, 2n);
  const zecPrepared = prepareSwapFunding(authorized, "zec", keccak256Text("zr"), 3n);
  const zecSeen = observeSwapFunding(zecPrepared, fundingEvidence("zec"));
  const zecFunded = confirmSwapFunding(zecSeen, "zec", fundingEvidence("zec").evidenceId);
  const evmPrepared = prepareSwapFunding(zecFunded, "evm", keccak256Text("er"), 4n);
  const evmSeen = observeSwapFunding(evmPrepared, fundingEvidence("evm"));
  const bothFunded = confirmSwapFunding(evmSeen, "evm", fundingEvidence("evm").evidenceId);
  const claimEvidence = spendEvidence("evm", "claim", terms.evmRefundTime - 1n);
  const revealed = observeSwapSpend(bothFunded, claimEvidence);
  const disputed = retractSwapEvidence(revealed, claimEvidence.evidenceId, "Canonical EVM claim left the best chain");
  assert.equal(disputed.secret, fixturePreimage);
  assert.equal(disputed.retractedEvidenceIds[claimEvidence.evidenceId], true);
  assert.equal(swapPhase(disputed), "disputed");
  assert.throws(() => prepareSwapFunding(disputed, "evm", keccak256Text("blocked"), 5n), /disputed/);
});

test("rejects retraction of unknown evidence without changing state", () => {
  const funded = fundedSwap();
  const before = structuredClone(funded);
  assert.throws(() => retractSwapEvidence(funded, keccak256Text("unknown"), "Unknown reorg"), /unknown/);
  assert.deepEqual(funded, before);
});
