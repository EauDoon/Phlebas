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
  sampleMarketPolicy,
  sampleSwapTerms,
  sampleTimingPolicy,
  spendEvidence,
} from "./swap-test-fixtures.ts";
import {
  abandonSwapFunding,
  authorizeSwapTerms,
  confirmSwapFunding,
  createSwapState,
  expireSwap,
  observeSwapFunding,
  observeSwapSpend,
  prepareSwapFunding,
  confirmSwapSpend,
  flagSwapDispute,
  retractSwapEvidence,
  replaceSwapFundingAttestation,
  replaceSwapSpendAttestation,
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
  const created = createSwapState(sampleSwapTerms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy);
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
  assert.deepEqual(prepared.zec, {
    phase: "funding-prepared",
    fundingArtifactHash: keccak256Text("zec-artifact"),
    fundingPreparedAtSeconds: sampleSwapTerms.zecFundBy - 1n,
  });
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
  const created = createSwapState(terms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy);
  const first = authorizeSwapTerms(created, terms.zecSellerId, created.termsHash, 1n);
  const authorized = authorizeSwapTerms(first, terms.stablecoinSellerId, created.termsHash, 2n);
  const zecPrepared = prepareSwapFunding(authorized, "zec", keccak256Text("zec-artifact"), terms.zecFundBy - 1n);
  const zecQuorum = observeFundingQuorum(zecPrepared, "zec", terms);
  const zecConfirmed = confirmSwapFunding(zecQuorum.observed, "zec", zecQuorum.first.fact.factId, zecQuorum.qualifiedAtSeconds);
  const evmPrepared = prepareSwapFunding(zecConfirmed, "evm", keccak256Text("evm-artifact"), terms.evmFundBy - 1n);
  const evmQuorum = observeFundingQuorum(evmPrepared, "evm", terms);
  const bothFunded = confirmSwapFunding(evmQuorum.observed, "evm", evmQuorum.first.fact.factId, evmQuorum.qualifiedAtSeconds);

  const claim = spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff, terms);
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
  const secondClaim = spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff, terms, 1);
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
  assert.throws(() => observeSwapSpend(evmRefund.observed, spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff, terms)), /not available/);
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

test("accepts EVM claims at the signed cutoff and rejects them one second later", () => {
  const terms = { ...sampleSwapTerms, secretHash: fixtureSecretHash };
  const created = createSwapState(terms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy);
  const first = authorizeSwapTerms(created, terms.zecSellerId, created.termsHash, 1n);
  const authorized = authorizeSwapTerms(first, terms.stablecoinSellerId, created.termsHash, 2n);
  const zecPrepared = prepareSwapFunding(authorized, "zec", keccak256Text("za"), 3n);
  const zecQuorum = observeFundingQuorum(zecPrepared, "zec", terms);
  const zecFunded = confirmSwapFunding(zecQuorum.observed, "zec", zecQuorum.first.fact.factId, zecQuorum.qualifiedAtSeconds);
  const evmPrepared = prepareSwapFunding(zecFunded, "evm", keccak256Text("ea"), terms.evmFundBy - 1n);
  const evmQuorum = observeFundingQuorum(evmPrepared, "evm", terms);
  const bothFunded = confirmSwapFunding(evmQuorum.observed, "evm", evmQuorum.first.fact.factId, evmQuorum.qualifiedAtSeconds);
  assert.equal(
    observeSwapSpend(bothFunded, spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff, terms)).evm.phase,
    "claim-seen",
  );
  assert.throws(
    () => observeSwapSpend(bothFunded, spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff + 1n, terms)),
    /after its signed claim cutoff/,
  );
});

test("accepts a transparent ZEC claim at the refund threshold while the outpoint remains unspent", () => {
  const terms = { ...sampleSwapTerms, secretHash: fixtureSecretHash };
  const bothFunded = fundedSwap(terms);
  const evmClaim = observeSpendQuorum(bothFunded, "evm", "claim", terms.evmClaimSafetyCutoff, terms);
  const evmClaimed = confirmSwapSpend(
    evmClaim.observed,
    "evm",
    evmClaim.first.fact.factId,
    evmClaim.qualifiedAtSeconds,
  );
  const zecClaim = observeSpendQuorum(evmClaimed, "zec", "claim", terms.zecRefundTime, terms);
  const settled = confirmSwapSpend(
    zecClaim.observed,
    "zec",
    zecClaim.first.fact.factId,
    zecClaim.qualifiedAtSeconds,
  );
  assert.equal(swapPhase(settled), "settled");
});

test("disputes observers that report different tips at the same height", () => {
  const prepared = prepareSwapFunding(
    authorizedSwap(),
    "zec",
    keccak256Text("conflicting-view-artifact"),
    sampleSwapTerms.zecFundBy - 1n,
  );
  const first = fundingEvidence("zec", "1", sampleSwapTerms, 0);
  const second = fundingEvidence("zec", "1", sampleSwapTerms, 1);
  const conflicting = {
    ...second,
    attestation: { ...second.attestation, tipBlockHash: keccak256Text("different-same-height-tip") },
  };
  const disputed = observeSwapFunding(observeSwapFunding(prepared, first), conflicting);
  assert.equal(swapPhase(disputed), "disputed");
  assert.equal(disputed.zec.fundingAttestations?.length, 2);
  assert.equal(disputed.disputes[0]?.evidenceId, conflicting.attestation.evidenceId);
  assert.throws(
    () => confirmSwapFunding(disputed, "zec", first.fact.factId, conflicting.attestation.observedAtSeconds),
    /disputed/,
  );
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
  const created = createSwapState(terms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy);
  const first = authorizeSwapTerms(created, terms.zecSellerId, created.termsHash, 1n);
  const authorized = authorizeSwapTerms(first, terms.stablecoinSellerId, created.termsHash, 2n);
  const zecPrepared = prepareSwapFunding(authorized, "zec", keccak256Text("zr"), 3n);
  const zecQuorum = observeFundingQuorum(zecPrepared, "zec", terms);
  const zecFunded = confirmSwapFunding(zecQuorum.observed, "zec", zecQuorum.first.fact.factId, zecQuorum.qualifiedAtSeconds);
  const evmPrepared = prepareSwapFunding(zecFunded, "evm", keccak256Text("er"), terms.evmFundBy - 1n);
  const evmQuorum = observeFundingQuorum(evmPrepared, "evm", terms);
  const bothFunded = confirmSwapFunding(evmQuorum.observed, "evm", evmQuorum.first.fact.factId, evmQuorum.qualifiedAtSeconds);
  const claimEvidence = spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff, terms);
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

test("abandons unbroadcast artifacts and expires only swaps without chain evidence", () => {
  const authorized = authorizedSwap();
  const artifact = keccak256Text("abandonable-artifact");
  const prepared = prepareSwapFunding(authorized, "zec", artifact, sampleSwapTerms.zecFundBy - 1n);
  assert.throws(
    () => abandonSwapFunding(prepared, "zec", keccak256Text("wrong-artifact"), sampleSwapTerms.zecFundBy - 1n),
    /does not match/,
  );
  const abandoned = abandonSwapFunding(prepared, "zec", artifact, sampleSwapTerms.zecFundBy - 1n);
  assert.equal(abandoned.zec.phase, "unfunded");
  assert.throws(() => expireSwap(abandoned, sampleSwapTerms.zecFundBy - 1n, "Too early"), /before/);
  const expired = expireSwap(abandoned, sampleSwapTerms.zecFundBy, "Signed ZEC funding window elapsed");
  assert.equal(swapPhase(expired), "expired");
  assert.throws(
    () => prepareSwapFunding(expired, "zec", artifact, sampleSwapTerms.zecFundBy),
    /terminal/,
  );
  assert.throws(
    () => expireSwap(fundedZecSwap(), sampleSwapTerms.zecRefundTime, "Funds require recovery"),
    /claim or refund recovery/,
  );
});

test("replaces a retracted unconfirmed observer report without erasing audit history", () => {
  const terms = { ...sampleSwapTerms, secretHash: fixtureSecretHash };
  const funded = fundedSwap(terms);
  const first = spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff, terms, 0);
  const observed = observeSwapSpend(funded, first);
  const disputed = retractSwapEvidence(observed, first.attestation.evidenceId, "Observer report left the canonical view");
  const replacement = {
    ...first,
    attestation: {
      ...first.attestation,
      evidenceId: keccak256Text("replacement-claim-attestation"),
      tipBlockHash: keccak256Text("replacement-claim-tip"),
    },
  };
  const recovered = replaceSwapSpendAttestation(
    disputed,
    "evm",
    first.attestation.evidenceId,
    replacement,
    keccak256Text("claim-attestation-resolution"),
    replacement.attestation.observedAtSeconds,
    "Accepted a fresh approved report for the same canonical claim fact",
  );
  assert.equal(recovered.disputes.length, 0);
  assert.equal(recovered.resolutions.length, 1);
  assert.equal(recovered.retractedEvidenceIds[first.attestation.evidenceId], true);
  assert.equal(recovered.evm.spendAttestations?.[0]?.evidenceId, replacement.attestation.evidenceId);
  assert.equal(swapPhase(recovered), "secret-observed");
  assert.throws(
    () => replaceSwapSpendAttestation(
      recovered,
      "evm",
      first.attestation.evidenceId,
      replacement,
      keccak256Text("second-resolution"),
      replacement.attestation.observedAtSeconds,
      "Cannot resolve twice",
    ),
    /Retracted spend attestation is not present/,
  );
});

test("replaces a retracted unconfirmed funding report for the same fact only", () => {
  const prepared = prepareSwapFunding(
    authorizedSwap(),
    "zec",
    keccak256Text("replaceable-funding-artifact"),
    sampleSwapTerms.zecFundBy - 1n,
  );
  const first = fundingEvidence("zec", "1", sampleSwapTerms, 0);
  const observed = observeSwapFunding(prepared, first);
  const disputed = retractSwapEvidence(observed, first.attestation.evidenceId, "Observer funding report reorganized");
  const replacement = {
    ...first,
    attestation: {
      ...first.attestation,
      evidenceId: keccak256Text("replacement-funding-attestation"),
      tipBlockHash: keccak256Text("replacement-funding-tip"),
    },
  };
  const recovered = replaceSwapFundingAttestation(
    disputed,
    "zec",
    first.attestation.evidenceId,
    replacement,
    keccak256Text("funding-attestation-resolution"),
    replacement.attestation.observedAtSeconds,
    "Accepted a fresh approved report for the same canonical funding fact",
  );
  assert.equal(recovered.disputes.length, 0);
  assert.equal(recovered.resolutions.length, 1);
  assert.equal(recovered.zec.funding?.factId, first.fact.factId);
  assert.equal(recovered.zec.fundingAttestations?.[0]?.evidenceId, replacement.attestation.evidenceId);
  assert.throws(
    () => replaceSwapFundingAttestation(
      disputed,
      "zec",
      first.attestation.evidenceId,
      fundingEvidence("zec", "conflicting", sampleSwapTerms, 0),
      keccak256Text("conflicting-funding-resolution"),
      replacement.attestation.observedAtSeconds,
      "A different funding fact cannot replace the accepted fact",
    ),
    /same canonical fact/,
  );
});

test("requires fresh replacement evidence and a complete resolution graph", () => {
  const prepared = prepareSwapFunding(
    authorizedSwap(),
    "zec",
    keccak256Text("fresh-replacement-artifact"),
    sampleSwapTerms.zecFundBy - 1n,
  );
  const first = fundingEvidence("zec", "1", sampleSwapTerms, 0);
  const second = fundingEvidence("zec", "1", sampleSwapTerms, 1);
  const observed = observeSwapFunding(observeSwapFunding(prepared, first), second);
  const disputed = retractSwapEvidence(observed, first.attestation.evidenceId, "First report left the canonical view");
  assert.throws(
    () => replaceSwapFundingAttestation(
      disputed,
      "zec",
      first.attestation.evidenceId,
      { fact: first.fact, attestation: second.attestation },
      keccak256Text("reused-evidence-resolution"),
      second.attestation.observedAtSeconds,
      "An active report cannot be reused as replacement evidence",
    ),
    /must be fresh/,
  );

  const replacement = {
    fact: first.fact,
    attestation: {
      ...first.attestation,
      evidenceId: keccak256Text("fresh-replacement-evidence"),
    },
  };
  const recovered = replaceSwapFundingAttestation(
    disputed,
    "zec",
    first.attestation.evidenceId,
    replacement,
    keccak256Text("fresh-evidence-resolution"),
    replacement.attestation.observedAtSeconds,
    "Fresh evidence restored the canonical observer quorum",
  );
  assert.throws(
    () => swapPhase({
      ...recovered,
      zec: {
        ...recovered.zec,
        fundingAttestations: recovered.zec.fundingAttestations?.filter(
          (attestation) => attestation.evidenceId !== replacement.attestation.evidenceId,
        ),
      },
    }),
    /replacement must remain active/,
  );
  assert.throws(
    () => swapPhase({
      ...recovered,
      resolutions: [{ ...recovered.resolutions[0]!, occurredAtSeconds: 0n }],
    }),
    /cannot precede either observer report/,
  );
  assert.throws(
    () => swapPhase({
      ...recovered,
      resolutions: [{
        ...recovered.resolutions[0]!,
        retractedSourceId: sampleEvidencePolicies.observer.sourceIds[1]!,
      }],
    }),
    /retracted attestation does not bind/,
  );
});

test("rejects malformed terminal and resolution metadata", () => {
  const authorized = authorizedSwap();
  assert.throws(
    () => swapPhase({
      ...authorized,
      terminal: { kind: "expired", occurredAtSeconds: sampleSwapTerms.zecFundBy - 1n, reason: "Too early" },
    }),
    /predates/,
  );
  const orphanFactId = keccak256Text("orphan-fact");
  const orphanRetractedId = keccak256Text("not-retracted");
  const orphanReplacementId = keccak256Text("replacement");
  const orphanRetractedAttestation = {
    ...fundingEvidence("zec", "orphan", sampleSwapTerms, 0).attestation,
    evidenceId: orphanRetractedId,
    factId: orphanFactId,
  };
  const orphanReplacementAttestation = {
    ...fundingEvidence("zec", "orphan", sampleSwapTerms, 1).attestation,
    evidenceId: orphanReplacementId,
    factId: orphanFactId,
  };
  assert.throws(
    () => swapPhase({
      ...authorized,
      resolutions: [{
        resolutionId: keccak256Text("orphan-resolution"),
        leg: "zec",
        evidenceKind: "funding",
        factId: orphanFactId,
        retractedEvidenceId: orphanRetractedId,
        retractedSourceId: sampleEvidencePolicies.observer.sourceIds[0]!,
        retractedAttestation: orphanRetractedAttestation,
        replacementEvidenceId: orphanReplacementId,
        replacementSourceId: sampleEvidencePolicies.observer.sourceIds[1]!,
        replacementAttestation: orphanReplacementAttestation,
        occurredAtSeconds: sampleSwapTerms.zecFundBy,
        detail: "Orphan recovery record",
      }],
    }),
    /reference retracted evidence/,
  );
  const firstId = keccak256Text("cycle-first");
  const secondId = keccak256Text("cycle-second");
  const cycleFactId = keccak256Text("cycle-fact");
  const firstAttestation = {
    ...fundingEvidence("zec", "cycle", sampleSwapTerms, 0).attestation,
    evidenceId: firstId,
    factId: cycleFactId,
  };
  const secondAttestation = {
    ...fundingEvidence("zec", "cycle", sampleSwapTerms, 1).attestation,
    evidenceId: secondId,
    factId: cycleFactId,
  };
  assert.throws(
    () => swapPhase({
      ...authorized,
      retractedEvidenceIds: { [firstId]: true, [secondId]: true },
      resolutions: [{
        resolutionId: keccak256Text("cycle-resolution-one"),
        leg: "zec",
        evidenceKind: "funding",
        factId: cycleFactId,
        retractedEvidenceId: firstId,
        retractedSourceId: sampleEvidencePolicies.observer.sourceIds[0]!,
        retractedAttestation: firstAttestation,
        replacementEvidenceId: secondId,
        replacementSourceId: sampleEvidencePolicies.observer.sourceIds[1]!,
        replacementAttestation: secondAttestation,
        occurredAtSeconds: sampleSwapTerms.zecFundBy,
        detail: "First cyclic replacement",
      }, {
        resolutionId: keccak256Text("cycle-resolution-two"),
        leg: "zec",
        evidenceKind: "funding",
        factId: cycleFactId,
        retractedEvidenceId: secondId,
        retractedSourceId: sampleEvidencePolicies.observer.sourceIds[1]!,
        retractedAttestation: secondAttestation,
        replacementEvidenceId: firstId,
        replacementSourceId: sampleEvidencePolicies.observer.sourceIds[0]!,
        replacementAttestation: firstAttestation,
        occurredAtSeconds: sampleSwapTerms.zecFundBy,
        detail: "Second cyclic replacement",
      }],
    }),
    /cycle/,
  );
});

test("rejects persisted funding preparation before its causal authorization and confirmation gates", () => {
  const zecFunded = fundedZecSwap();
  assert.throws(
    () => swapPhase({
      ...zecFunded,
      zec: { ...zecFunded.zec, fundingPreparedAtSeconds: 1n },
    }),
    /cannot predate exact terms authorization/,
  );

  const bothFunded = fundedSwap();
  assert.throws(
    () => swapPhase({
      ...bothFunded,
      evm: {
        ...bothFunded.evm,
        fundingPreparedAtSeconds: (bothFunded.zec.fundingConfirmedAtSeconds as bigint) - 1n,
      },
    }),
    /cannot predate policy-confirmed ZEC funding/,
  );
});

test("rejects a forged settled phase without canonical chain facts", () => {
  const authorized = authorizedSwap();
  assert.throws(
    () => swapPhase({
      ...authorized,
      zec: { phase: "claimed-confirmed" },
      evm: { phase: "claimed-confirmed" },
    }),
    /funding/,
  );
});
