import assert from "node:assert/strict";
import test from "node:test";

import { keccak256Text } from "./keccak.ts";
import {
  fixtureSecretHash,
  fundingEvidence,
  sampleEvidencePolicies,
  sampleMarketPolicy,
  sampleSwapTerms,
  sampleTimingPolicy,
  spendEvidence,
} from "./swap-test-fixtures.ts";
import {
  appendSwapEvent,
  emptySwapJournal,
  hashSwapEventPayload,
  verifySwapJournal,
  type SwapEventPayload,
} from "./swap-journal.ts";
import { createSwapState } from "./swap-state.ts";

function fixture() {
  const state = createSwapState(sampleSwapTerms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy);
  return { state, journal: emptySwapJournal(state) };
}

function authorizedJournal(terms = sampleSwapTerms) {
  const state = createSwapState(terms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy);
  const initial = { state, journal: emptySwapJournal(state) };
  const first = appendSwapEvent(initial.journal, initial.state, {
    kind: "authorize-terms",
    partyId: terms.zecSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: terms.authorizationDeadline - 2n,
  });
  return appendSwapEvent(first.journal, first.state, {
    kind: "authorize-terms",
    partyId: terms.stablecoinSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: terms.authorizationDeadline - 1n,
  });
}

function preparedZecJournal(artifactHash: ReturnType<typeof keccak256Text>, terms = sampleSwapTerms) {
  const authorized = authorizedJournal(terms);
  return appendSwapEvent(authorized.journal, authorized.state, {
    kind: "prepare-funding",
    leg: "zec",
    artifactHash,
    occurredAtSeconds: terms.zecFundBy - 1n,
  });
}

function fundedJournal(terms = sampleSwapTerms) {
  const zecPrepared = preparedZecJournal(keccak256Text("journal-zec-artifact"), terms);
  const zecFirstEvidence = fundingEvidence("zec", "1", terms, 0);
  const zecFirst = appendSwapEvent(zecPrepared.journal, zecPrepared.state, {
    kind: "observe-funding",
    evidence: zecFirstEvidence,
  });
  const zecSecondEvidence = fundingEvidence("zec", "1", terms, 1);
  const zecSecond = appendSwapEvent(zecFirst.journal, zecFirst.state, {
    kind: "observe-funding",
    evidence: zecSecondEvidence,
  });
  const zecConfirmed = appendSwapEvent(zecSecond.journal, zecSecond.state, {
    kind: "confirm-funding",
    leg: "zec",
    factId: zecFirstEvidence.fact.factId,
    qualifiedAtSeconds: zecSecondEvidence.attestation.observedAtSeconds,
  });
  const evmPrepared = appendSwapEvent(zecConfirmed.journal, zecConfirmed.state, {
    kind: "prepare-funding",
    leg: "evm",
    artifactHash: keccak256Text("journal-evm-artifact"),
    occurredAtSeconds: terms.evmFundBy - 1n,
  });
  const evmFirstEvidence = fundingEvidence("evm", "1", terms, 0);
  const evmFirst = appendSwapEvent(evmPrepared.journal, evmPrepared.state, {
    kind: "observe-funding",
    evidence: evmFirstEvidence,
  });
  const evmSecondEvidence = fundingEvidence("evm", "1", terms, 1);
  const evmSecond = appendSwapEvent(evmFirst.journal, evmFirst.state, {
    kind: "observe-funding",
    evidence: evmSecondEvidence,
  });
  return appendSwapEvent(evmSecond.journal, evmSecond.state, {
    kind: "confirm-funding",
    leg: "evm",
    factId: evmFirstEvidence.fact.factId,
    qualifiedAtSeconds: evmSecondEvidence.attestation.observedAtSeconds,
  });
}

test("chains deterministic swap event receipts", () => {
  const initial = fixture();
  const firstPayload: SwapEventPayload = {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: 1n,
  };
  const first = appendSwapEvent(initial.journal, initial.state, firstPayload);
  const second = appendSwapEvent(first.journal, first.state, {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.stablecoinSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: 2n,
  });
  assert.equal(second.receipt.sequence, 2n);
  assert.equal(second.receipt.previousEventHash, first.receipt.eventHash);
  assert.equal(second.journal.head, second.receipt.eventHash);
  assert.equal(verifySwapJournal(second.journal), true);
});

test("rejects an advanced state as a journal genesis", () => {
  assert.throws(
    () => emptySwapJournal(authorizedJournal().state),
    /pristine created state/,
  );
});

test("makes exact duplicate payloads idempotent", () => {
  const initial = fixture();
  const payload: SwapEventPayload = {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: 1n,
  };
  const appended = appendSwapEvent(initial.journal, initial.state, payload);
  const duplicate = appendSwapEvent(appended.journal, appended.state, structuredClone(payload));
  assert.equal(duplicate.appended, false);
  assert.equal(duplicate.journal, appended.journal);
  assert.equal(duplicate.state, appended.state);
});

test("rejects an exact duplicate payload when the supplied state is stale", () => {
  const initial = fixture();
  const payload: SwapEventPayload = {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: 1n,
  };
  const appended = appendSwapEvent(initial.journal, initial.state, payload);
  assert.throws(
    () => appendSwapEvent(appended.journal, initial.state, structuredClone(payload)),
    /does not match the journal head/,
  );
});

test("rejects conflicting content in the same semantic slot", () => {
  const initial = fixture();
  const first = appendSwapEvent(initial.journal, initial.state, {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: 1n,
  });
  assert.throws(() => appendSwapEvent(first.journal, first.state, {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: 2n,
  }), /semantic slot/);
});

test("detects receipt payload, hash-chain, and sequence corruption", () => {
  const initial = fixture();
  const appended = appendSwapEvent(initial.journal, initial.state, {
    kind: "flag-dispute",
    reason: "observer-stale",
    detail: "Fixture observer is stale",
  });
  assert.equal(verifySwapJournal(appended.journal), true);
  assert.equal(verifySwapJournal({ ...appended.journal, head: keccak256Text("wrong") }), false);
  assert.equal(verifySwapJournal({
    ...appended.journal,
    receipts: [{ ...appended.receipt, sequence: 2n }],
  }), false);
  assert.equal(verifySwapJournal({
    ...appended.journal,
    receipts: [{ ...appended.receipt, payload: { ...appended.receipt.payload, detail: "Changed" } as SwapEventPayload }],
  }), false);
});

test("forbids JavaScript numbers inside hashed journal payloads", () => {
  const evidence = fundingEvidence("zec");
  assert.throws(() => hashSwapEventPayload({
    kind: "observe-funding",
    evidence: { ...evidence, fact: { ...evidence.fact, blockHeight: 1 as unknown as bigint } },
  }), /numbers are forbidden/);
});

test("rejects missing, extra, and undefined runtime payload fields", () => {
  const evidence = fundingEvidence("zec");
  assert.throws(() => hashSwapEventPayload({
    kind: "observe-funding",
    evidence: { ...evidence, unexpected: true },
  } as unknown as SwapEventPayload), /unknown fields/);
  assert.throws(() => hashSwapEventPayload({
    kind: "observe-funding",
    evidence: { ...evidence, fact: { ...evidence.fact, unexpected: true } },
  } as unknown as SwapEventPayload), /unknown fields/);
  assert.throws(() => hashSwapEventPayload({
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: sampleSwapTerms.zecOrderHash,
  } as unknown as SwapEventPayload), /missing required fields/);
  assert.throws(() => hashSwapEventPayload({
    kind: "flag-dispute",
    reason: "observer-stale",
    detail: "Undefined is not canonical",
    evidenceId: undefined,
  }), /undefined/);
});

test("rejects unknown payload kinds and histories that cannot replay", () => {
  const initial = fixture();
  const appended = appendSwapEvent(initial.journal, initial.state, {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: 1n,
  });
  const unknownHistory = {
    ...appended.journal,
    receipts: [{ ...appended.receipt, payload: { kind: "future-unknown" } as unknown as SwapEventPayload }],
  };
  assert.equal(verifySwapJournal(unknownHistory), false);
  assert.throws(
    () => appendSwapEvent(unknownHistory, appended.state, {
      kind: "flag-dispute",
      reason: "observer-stale",
      detail: "History must replay before append",
    }),
    /invalid swap journal/,
  );

  const unreplayable = {
    ...appended.journal,
    initialState: { ...initial.state, termsHash: keccak256Text("wrong") },
  };
  assert.equal(verifySwapJournal(unreplayable), false);
});

test("journals two independent observers that agree on one funding fact", () => {
  const prepared = preparedZecJournal(keccak256Text("two-observer-artifact"));
  const first = appendSwapEvent(prepared.journal, prepared.state, {
    kind: "observe-funding",
    evidence: fundingEvidence("zec", "1", sampleSwapTerms, 0),
  });
  const second = appendSwapEvent(first.journal, first.state, {
    kind: "observe-funding",
    evidence: fundingEvidence("zec", "1", sampleSwapTerms, 1),
  });
  assert.equal(second.state.zec.fundingAttestations?.length, 2);
  assert.equal(verifySwapJournal(second.journal), true);
});

test("journals artifact abandonment and terminal expiry", () => {
  const artifactHash = keccak256Text("journal-abandon-artifact");
  const prepared = preparedZecJournal(artifactHash);
  const abandoned = appendSwapEvent(prepared.journal, prepared.state, {
    kind: "abandon-funding",
    leg: "zec",
    artifactHash,
    occurredAtSeconds: sampleSwapTerms.zecFundBy - 1n,
  });
  const expired = appendSwapEvent(abandoned.journal, abandoned.state, {
    kind: "expire-swap",
    occurredAtSeconds: sampleSwapTerms.zecFundBy,
    reason: "Signed funding window elapsed",
  });
  assert.equal(expired.state.terminal?.kind, "expired");
  assert.equal(verifySwapJournal(expired.journal), true);
});

test("journals abandon and reprepare with a fresh artifact across replay", () => {
  const firstArtifact = keccak256Text("journal-first-artifact");
  const secondArtifact = keccak256Text("journal-second-artifact");
  const prepared = preparedZecJournal(firstArtifact);
  const abandoned = appendSwapEvent(prepared.journal, prepared.state, {
    kind: "abandon-funding",
    leg: "zec",
    artifactHash: firstArtifact,
    occurredAtSeconds: sampleSwapTerms.zecFundBy - 1n,
  });
  const reprepared = appendSwapEvent(abandoned.journal, abandoned.state, {
    kind: "prepare-funding",
    leg: "zec",
    artifactHash: secondArtifact,
    occurredAtSeconds: sampleSwapTerms.zecFundBy - 1n,
  });
  assert.equal(reprepared.state.zec.fundingArtifactHash, secondArtifact);
  assert.equal(verifySwapJournal(reprepared.journal), true);
});

test("replays a retracted spend attestation replacement with its audit record", () => {
  const terms = { ...sampleSwapTerms, secretHash: fixtureSecretHash };
  const initial = fundedJournal(terms);
  const firstEvidence = spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff, terms, 0);
  const observed = appendSwapEvent(initial.journal, initial.state, {
    kind: "observe-spend",
    evidence: firstEvidence,
  });
  const retracted = appendSwapEvent(observed.journal, observed.state, {
    kind: "retract-evidence",
    evidenceId: firstEvidence.attestation.evidenceId,
    detail: "Observer claim report left the canonical view",
  });
  const replacement = {
    ...firstEvidence,
    attestation: {
      ...firstEvidence.attestation,
      evidenceId: keccak256Text("journal-replacement-claim-attestation"),
      tipBlockHash: keccak256Text("journal-replacement-claim-tip"),
    },
  };
  const recovered = appendSwapEvent(retracted.journal, retracted.state, {
    kind: "replace-spend-attestation",
    leg: "evm",
    retractedEvidenceId: firstEvidence.attestation.evidenceId,
    replacement,
    resolutionId: keccak256Text("journal-claim-resolution"),
    occurredAtSeconds: replacement.attestation.observedAtSeconds,
    detail: "Accepted a fresh approved report for the same canonical claim fact",
  });
  assert.equal(recovered.state.disputes.length, 0);
  assert.equal(recovered.state.resolutions.length, 1);
  assert.equal(recovered.state.retractedEvidenceIds[firstEvidence.attestation.evidenceId], true);
  assert.equal(verifySwapJournal(recovered.journal), true);
});
