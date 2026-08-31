import assert from "node:assert/strict";
import test from "node:test";

import { keccak256Text } from "./keccak.ts";
import { hashSwapTerms } from "./swap-domain.ts";
import {
  authorizedSwap,
  fixturePreimage,
  fixtureSecretHash,
  fundedSwap,
  fundedZecSwap,
  fundingEvidence,
  sampleEvidencePolicies,
  sampleSwapTerms,
  sampleTimingPolicy,
  spendEvidence,
} from "./swap-test-fixtures.ts";
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
  spendFactId,
  swapPhase,
  type SwapLeg,
  type SpendEvidence,
  type SwapState,
} from "./swap-state.ts";

function observeFundingQuorum(state: SwapState, leg: SwapLeg, terms = sampleSwapTerms) {
  const first = fundingEvidence(leg, "1", terms, 0);
  const second = fundingEvidence(leg, "1", terms, 1);
  const observed = observeSwapFunding(observeSwapFunding(state, first), second);
  return { first, observed, qualifiedAtSeconds: second.attestation.observedAtSeconds };
}

function observeSpendQuorum(
  state: SwapState,
  leg: SwapLeg,
  action: "claim" | "refund",
  executedAtSeconds: bigint,
  terms = sampleSwapTerms,
) {
  const first = spendEvidence(leg, action, executedAtSeconds, terms, 0);
  const second = spendEvidence(leg, action, executedAtSeconds, terms, 1);
  const observed = observeSwapSpend(observeSwapSpend(state, first), second);
  return { first, observed, qualifiedAtSeconds: second.attestation.observedAtSeconds };
}

function replaceSpendFact(evidence: SpendEvidence, changes: Partial<Omit<SpendEvidence["fact"], "factId">>): SpendEvidence {
  const { factId: _factId, ...current } = evidence.fact;
  void _factId;
  const unsigned = { ...current, ...changes };
  return { ...evidence, fact: { factId: spendFactId(unsigned), ...unsigned } };
}

test("requires both exact terms authorizations before ZEC funding", () => {
  const created = createSwapState(sampleSwapTerms, sampleTimingPolicy, sampleEvidencePolicies);
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
  const evidence = fundingEvidence("zec");
  assert.throws(
    () => observeSwapFunding(prepared, { ...evidence, fact: { ...evidence.fact, amountAtoms: 1n } }),
    /canonical content/,
  );
  assert.deepEqual(prepared.zec, { phase: "funding-prepared", fundingArtifactHash: keccak256Text("zec-artifact") });
  const observed = observeSwapFunding(prepared, evidence);
  assert.equal(swapPhase(observed), "awaiting-zec-confirmation");
  assert.throws(() => confirmSwapFunding(observed, "zec", evidence.fact.factId, evidence.attestation.observedAtSeconds), /quorum/);
  assert.throws(() => confirmSwapFunding(observed, "zec", keccak256Text("wrong"), evidence.attestation.observedAtSeconds), /does not match/);
  const second = fundingEvidence("zec", "1", sampleSwapTerms, 1);
  const quorum = observeSwapFunding(observed, second);
  const confirmed = confirmSwapFunding(quorum, "zec", evidence.fact.factId, second.attestation.observedAtSeconds);
  assert.equal(swapPhase(confirmed), "awaiting-evm-funding");
});

test("funds the EVM leg only inside its safe window", () => {
  const zecFunded = fundedZecSwap();
  assert.throws(
    () => prepareSwapFunding(zecFunded, "evm", keccak256Text("evm-artifact"), sampleSwapTerms.evmFundBy),
    /window has closed/,
  );
  const prepared = prepareSwapFunding(zecFunded, "evm", keccak256Text("evm-artifact"), sampleSwapTerms.evmFundBy - 1n);
  const { first, observed, qualifiedAtSeconds } = observeFundingQuorum(prepared, "evm");
  assert.equal(swapPhase(observed), "awaiting-evm-confirmation");
  const confirmed = confirmSwapFunding(observed, "evm", first.fact.factId, qualifiedAtSeconds);
  assert.equal(swapPhase(confirmed), "awaiting-evm-claim");
});

test("reveals the secret only from a successful canonical EVM claim", () => {
  const terms = { ...sampleSwapTerms, secretHash: fixtureSecretHash };
  const created = createSwapState(terms, sampleTimingPolicy, sampleEvidencePolicies);
  const first = authorizeSwapTerms(created, terms.zecSellerId, created.termsHash, 1n);
  const authorized = authorizeSwapTerms(first, terms.stablecoinSellerId, created.termsHash, 2n);
  const zecPrepared = prepareSwapFunding(authorized, "zec", keccak256Text("zec-artifact"), terms.zecFundBy - 1n);
  const zecQuorum = observeFundingQuorum(zecPrepared, "zec", terms);
  const zecConfirmed = confirmSwapFunding(zecQuorum.observed, "zec", zecQuorum.first.fact.factId, zecQuorum.qualifiedAtSeconds);
  const evmPrepared = prepareSwapFunding(zecConfirmed, "evm", keccak256Text("evm-artifact"), terms.evmFundBy - 1n);
  const evmQuorum = observeFundingQuorum(evmPrepared, "evm", terms);
  const bothFunded = confirmSwapFunding(evmQuorum.observed, "evm", evmQuorum.first.fact.factId, evmQuorum.qualifiedAtSeconds);

  const claim = spendEvidence("evm", "claim", terms.evmRefundTime - 1n, terms);
  assert.throws(() => observeSwapSpend(bothFunded, replaceSpendFact(claim, { successful: false })), /Failed/);
  assert.equal(bothFunded.observedSecret, undefined);
  assert.throws(
    () => observeSwapSpend(bothFunded, replaceSpendFact(claim, { preimage: `0x${"11".repeat(32)}` })),
    /hashlock/,
  );
  const reveal = observeSwapSpend(bothFunded, claim);
  assert.equal(reveal.observedSecret, fixturePreimage);
  assert.equal(swapPhase(reveal), "secret-observed");
  assert.throws(() => observeSwapSpend(reveal, spendEvidence("zec", "claim", terms.zecRefundTime - 1n, terms)), /policy-confirmed/);
  const secondClaim = spendEvidence("evm", "claim", terms.evmRefundTime - 1n, terms, 1);
  const claimQuorum = observeSwapSpend(reveal, secondClaim);
  const evmClaimed = confirmSwapSpend(claimQuorum, "evm", claim.fact.factId, secondClaim.attestation.observedAtSeconds);
  assert.equal(swapPhase(evmClaimed), "awaiting-zec-claim");
  const zecClaimQuorum = observeSpendQuorum(evmClaimed, "zec", "claim", terms.zecRefundTime - 1n, terms);
  const settled = confirmSwapSpend(
    zecClaimQuorum.observed,
    "zec",
    zecClaimQuorum.first.fact.factId,
    zecClaimQuorum.qualifiedAtSeconds,
  );
  assert.equal(swapPhase(settled), "settled");
});

test("keeps claim and refund mutually exclusive and rejects early refunds", () => {
  const terms = { ...sampleSwapTerms, secretHash: fixtureSecretHash };
  const bothFunded = fundedSwap(terms);
  assert.throws(() => observeSwapSpend(bothFunded, spendEvidence("evm", "refund", terms.evmRefundTime - 1n, terms)), /not eligible/);
  const evmRefund = observeSpendQuorum(bothFunded, "evm", "refund", terms.evmRefundTime, terms);
  assert.equal(swapPhase(evmRefund.observed), "refund-recovery");
  assert.throws(() => observeSwapSpend(evmRefund.observed, spendEvidence("evm", "claim", terms.evmRefundTime - 1n, terms)), /not available/);
  const evmRefunded = confirmSwapSpend(
    evmRefund.observed,
    "evm",
    evmRefund.first.fact.factId,
    evmRefund.qualifiedAtSeconds,
  );
  const zecRefund = observeSpendQuorum(evmRefunded, "zec", "refund", terms.zecRefundTime, terms);
  const recovered = confirmSwapSpend(zecRefund.observed, "zec", zecRefund.first.fact.factId, zecRefund.qualifiedAtSeconds);
  assert.equal(swapPhase(recovered), "refunded");
});

test("rejects EVM claims at the refund deadline", () => {
  const terms = { ...sampleSwapTerms, secretHash: fixtureSecretHash };
  const created = createSwapState(terms, sampleTimingPolicy, sampleEvidencePolicies);
  const first = authorizeSwapTerms(created, terms.zecSellerId, created.termsHash, 1n);
  const authorized = authorizeSwapTerms(first, terms.stablecoinSellerId, created.termsHash, 2n);
  const zecPrepared = prepareSwapFunding(authorized, "zec", keccak256Text("za"), 3n);
  const zecQuorum = observeFundingQuorum(zecPrepared, "zec", terms);
  const zecFunded = confirmSwapFunding(zecQuorum.observed, "zec", zecQuorum.first.fact.factId, zecQuorum.qualifiedAtSeconds);
  const evmPrepared = prepareSwapFunding(zecFunded, "evm", keccak256Text("ea"), 4n);
  const evmQuorum = observeFundingQuorum(evmPrepared, "evm", terms);
  const bothFunded = confirmSwapFunding(evmQuorum.observed, "evm", evmQuorum.first.fact.factId, evmQuorum.qualifiedAtSeconds);
  assert.throws(() => observeSwapSpend(bothFunded, spendEvidence("evm", "claim", terms.evmRefundTime, terms)), /at or after/);
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
  const created = createSwapState(terms, sampleTimingPolicy, sampleEvidencePolicies);
  const first = authorizeSwapTerms(created, terms.zecSellerId, created.termsHash, 1n);
  const authorized = authorizeSwapTerms(first, terms.stablecoinSellerId, created.termsHash, 2n);
  const zecPrepared = prepareSwapFunding(authorized, "zec", keccak256Text("zr"), 3n);
  const zecQuorum = observeFundingQuorum(zecPrepared, "zec", terms);
  const zecFunded = confirmSwapFunding(zecQuorum.observed, "zec", zecQuorum.first.fact.factId, zecQuorum.qualifiedAtSeconds);
  const evmPrepared = prepareSwapFunding(zecFunded, "evm", keccak256Text("er"), 4n);
  const evmQuorum = observeFundingQuorum(evmPrepared, "evm", terms);
  const bothFunded = confirmSwapFunding(evmQuorum.observed, "evm", evmQuorum.first.fact.factId, evmQuorum.qualifiedAtSeconds);
  const claimEvidence = spendEvidence("evm", "claim", terms.evmRefundTime - 1n, terms);
  const revealed = observeSwapSpend(bothFunded, claimEvidence);
  const disputed = retractSwapEvidence(revealed, claimEvidence.attestation.evidenceId, "Canonical EVM claim left the best chain");
  assert.equal(disputed.observedSecret, fixturePreimage);
  assert.equal(disputed.retractedEvidenceIds[claimEvidence.attestation.evidenceId], true);
  assert.equal(swapPhase(disputed), "disputed");
  assert.throws(() => prepareSwapFunding(disputed, "evm", keccak256Text("blocked"), 5n), /disputed/);
});

test("rejects retraction of unknown evidence without changing state", () => {
  const funded = fundedSwap();
  const before = structuredClone(funded);
  assert.throws(() => retractSwapEvidence(funded, keccak256Text("unknown"), "Unknown reorg"), /unknown/);
  assert.deepEqual(funded, before);
});
