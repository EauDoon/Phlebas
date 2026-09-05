import assert from "node:assert/strict";
import test from "node:test";

import { keccak256Text } from "./keccak.ts";
import { authorizedSwap, fundingEvidence, sampleSwapTerms } from "./swap-test-fixtures.ts";
import { flagSwapDispute, observeSwapFunding, prepareSwapFunding, swapPhase } from "./swap-state.ts";
import {
  clearSwapStaleObserverDispute,
  DISPUTE_RESOLUTION_ACTIVATION,
  disputeRequiresExplicitRetraction,
  DisputeResolutionDisabledError,
} from "./swap-dispute-resolution.ts";

const GATE_ENABLED = { activationGate: "enabled" as const };

/** Observer #1 re-reports the exact same canonical fact with a fresh tip. */
function freshAttestationFor(first: ReturnType<typeof fundingEvidence>["attestation"], offsetSeconds: bigint) {
  return { ...fundingEvidence("zec", "1", sampleSwapTerms, 1).attestation, observedAtSeconds: first.observedAtSeconds + offsetSeconds };
}

function staleDisputedState() {
  const prepared = prepareSwapFunding(authorizedSwap(sampleSwapTerms), "zec", keccak256Text("zec-artifact"), sampleSwapTerms.zecFundBy - 1n);
  const first = fundingEvidence("zec", "1", sampleSwapTerms, 0);
  const observed = observeSwapFunding(prepared, first);
  const disputed = flagSwapDispute(observed, "observer-stale", "Observation aged out of the policy window", first.attestation.evidenceId);
  return { first, disputed };
}

test("the activation gate ships disabled", () => {
  assert.equal(DISPUTE_RESOLUTION_ACTIVATION, "disabled");
  const { first, disputed } = staleDisputedState();
  assert.throws(
    () => clearSwapStaleObserverDispute(disputed, {
      leg: "zec",
      evidenceKind: "funding",
      staleEvidenceId: first.attestation.evidenceId,
      freshAttestation: freshAttestationFor(first.attestation, 60n),
    }),
    (error: unknown) => error instanceof DisputeResolutionDisabledError,
  );
  // Disabled behavior is byte-for-byte the previous behavior: the dispute stays.
  assert.equal(disputed.disputes.length, 1);
  assert.equal(swapPhase(disputed), "disputed");
});

test("a fresh attestation of the same fact clears only the stale dispute when enabled", () => {
  const { first, disputed } = staleDisputedState();
  const fresh = freshAttestationFor(first.attestation, 60n);
  const cleared = clearSwapStaleObserverDispute(disputed, {
    leg: "zec",
    evidenceKind: "funding",
    staleEvidenceId: first.attestation.evidenceId,
    freshAttestation: fresh,
  }, GATE_ENABLED);
  assert.equal(cleared.disputes.length, 0);
  assert.equal(swapPhase(cleared), "awaiting-zec-confirmation");
  assert.equal(cleared.zec.fundingAttestations?.length, 2);
  assert.ok(cleared.zec.fundingAttestations?.some((item) => item.evidenceId === fresh.evidenceId));
  // The stale attestation is not retracted: it remains in the evidence set.
  assert.ok(cleared.zec.fundingAttestations?.some((item) => item.evidenceId === first.attestation.evidenceId));
});

test("a fresh attestation for a different fact cannot clear staleness", () => {
  const { first, disputed } = staleDisputedState();
  const differentFact = fundingEvidence("zec", "different-fact", sampleSwapTerms, 5);
  assert.throws(
    () => clearSwapStaleObserverDispute(disputed, {
      leg: "zec",
      evidenceKind: "funding",
      staleEvidenceId: first.attestation.evidenceId,
      freshAttestation: differentFact.attestation,
    }, GATE_ENABLED),
    /exact same canonical fact/,
  );
});

test("a hard contradiction on the same evidence blocks the clearance", () => {
  const { first, disputed } = staleDisputedState();
  const conflicted = flagSwapDispute(disputed, "observer-conflict", "Two approved observers disagree at the same height", first.attestation.evidenceId);
  const fresh = freshAttestationFor(first.attestation, 60n);
  assert.throws(
    () => clearSwapStaleObserverDispute(conflicted, {
      leg: "zec",
      evidenceKind: "funding",
      staleEvidenceId: first.attestation.evidenceId,
      freshAttestation: fresh,
    }, GATE_ENABLED),
    /explicit retraction flow/,
  );
  // The hard dispute persists even though a fresh report arrived.
  assert.equal(conflicted.disputes.length, 2);
  assert.equal(swapPhase(conflicted), "disputed");
});

test("clearance requires an actual observer-stale dispute on the evidence", () => {
  const { first, disputed } = staleDisputedState();
  const fresh = freshAttestationFor(first.attestation, 60n);
  assert.throws(
    () => clearSwapStaleObserverDispute(disputed, {
      leg: "zec",
      evidenceKind: "funding",
      staleEvidenceId: keccak256Text("unknown-evidence"),
      freshAttestation: fresh,
    }, GATE_ENABLED),
    /No observer-stale dispute/,
  );
  void first;
});

test("duplicate fresh attestations are refused", () => {
  const { first, disputed } = staleDisputedState();
  const fresh = freshAttestationFor(first.attestation, 60n);
  const cleared = clearSwapStaleObserverDispute(disputed, {
    leg: "zec",
    evidenceKind: "funding",
    staleEvidenceId: first.attestation.evidenceId,
    freshAttestation: fresh,
  }, GATE_ENABLED);
  const staleAgain = flagSwapDispute(cleared, "observer-stale", "Aged out again", first.attestation.evidenceId);
  assert.throws(
    () => clearSwapStaleObserverDispute(staleAgain, {
      leg: "zec",
      evidenceKind: "funding",
      staleEvidenceId: first.attestation.evidenceId,
      freshAttestation: fresh,
    }, GATE_ENABLED),
    /already present/,
  );
});

test("the policy classifies conflicts and semantic mismatches as explicit-retraction-only", () => {
  assert.equal(disputeRequiresExplicitRetraction("observer-conflict"), true);
  assert.equal(disputeRequiresExplicitRetraction("semantic-mismatch"), true);
});

test("dispute state never alters fund facts or wallet recovery data", () => {
  const { first, disputed } = staleDisputedState();
  const cleared = clearSwapStaleObserverDispute(disputed, {
    leg: "zec",
    evidenceKind: "funding",
    staleEvidenceId: first.attestation.evidenceId,
    freshAttestation: freshAttestationFor(first.attestation, 60n),
  }, GATE_ENABLED);
  // Fund facts, including the wallet-side refund deadline, are untouched by
  // any dispute transition.
  assert.deepEqual(cleared.zec.funding, disputed.zec.funding);
  assert.deepEqual(cleared.terms, disputed.terms);
  assert.deepEqual(cleared.timingPolicy, disputed.timingPolicy);
  assert.deepEqual(cleared.evm, disputed.evm);
});
