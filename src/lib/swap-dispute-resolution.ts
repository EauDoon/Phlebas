// Coordinator dispute resolution (review-4, ADR 0011).
//
// Everything in this module sits behind a DISABLED activation gate. Until the
// independent security review named in ADR 0011 and docs/audit/open-items.md
// completes, every transition throws and the swap state machine behaves
// exactly as it did before this module existed.
//
// Policy summary (ADR 0011):
//   - observer-stale: transient. Clears when a fresh, policy-qualified
//     attestation of the SAME canonical fact arrives and no hard dispute
//     (observer-conflict, semantic-mismatch) exists on the same evidence.
//   - observer-conflict, semantic-mismatch: hard. They clear only through the
//     explicit retraction-and-replacement resolution flow that already exists
//     in swap-state.ts.
//   - No transition here moves funds, force-settles a swap, redirects a
//     payout, or gates the wallet-controlled on-chain refund path.

import {
  assertSwapStateIntegrity,
  type ObserverAttestation,
  type SwapLeg,
  type SwapState,
} from "./swap-state.ts";

/**
 * The activation gate. "disabled" is the shipped default; flipping it to
 * "enabled" is the one-line reviewed change ADR 0011 reserves for the
 * completed independent review.
 */
export const DISPUTE_RESOLUTION_ACTIVATION = "disabled" as const;
export type DisputeResolutionActivation = typeof DISPUTE_RESOLUTION_ACTIVATION | "enabled";

export const DISPUTE_RESOLUTION_DISABLED_COPY =
  "Dispute resolution is disabled pending the independent review of ADR 0011.";

export class DisputeResolutionDisabledError extends Error {
  constructor() {
    super(DISPUTE_RESOLUTION_DISABLED_COPY);
    this.name = "DisputeResolutionDisabledError";
  }
}

export type StaleObservationClearance = Readonly<{
  leg: SwapLeg;
  evidenceKind: "funding" | "spend";
  /** The disputed attestation's evidence id (the stale one). */
  staleEvidenceId: string;
  /** A fresh attestation binding the SAME canonical fact id. */
  freshAttestation: ObserverAttestation;
}>;

function findAttestation(state: SwapState, leg: SwapLeg, evidenceKind: "funding" | "spend", evidenceId: string): ObserverAttestation | null {
  const legState = state[leg];
  const collection = evidenceKind === "funding" ? legState.fundingAttestations : legState.spendAttestations;
  return collection?.find((item) => item.evidenceId === evidenceId) ?? null;
}

/**
 * Proposed transition: clear an observer-stale dispute with a fresh
 * attestation of the same canonical fact.
 *
 * Fails closed when the activation gate is disabled, when the dispute is not
 * exactly one observer-stale dispute bound to this evidence, when a hard
 * dispute (observer-conflict or semantic-mismatch) also exists for the same
 * evidence, or when the fresh attestation does not bind the exact same fact.
 */
export function clearSwapStaleObserverDispute(
  state: SwapState,
  clearance: StaleObservationClearance,
  options: { activationGate: DisputeResolutionActivation } = { activationGate: DISPUTE_RESOLUTION_ACTIVATION },
): SwapState {
  if (options.activationGate !== "enabled") throw new DisputeResolutionDisabledError();
  assertSwapStateIntegrity(state);
  if (state.terminal) throw new Error("Swap is terminal; disputes cannot be resolved");

  const stale = state.disputes.find(
    (dispute) => dispute.reason === "observer-stale" && dispute.evidenceId === clearance.staleEvidenceId,
  );
  if (stale === undefined) {
    throw new Error("No observer-stale dispute is bound to the supplied evidence");
  }
  // Hard contradictions never disappear because a fresh report arrived.
  const hard = state.disputes.find(
    (dispute) =>
      (dispute.reason === "observer-conflict" || dispute.reason === "semantic-mismatch")
      && dispute.evidenceId === clearance.staleEvidenceId,
  );
  if (hard !== undefined) {
    throw new Error(`Hard dispute ${hard.reason} on the same evidence requires the explicit retraction flow`);
  }

  const disputedAttestation = findAttestation(state, clearance.leg, clearance.evidenceKind, clearance.staleEvidenceId);
  if (disputedAttestation === null) {
    throw new Error("The disputed evidence is not present in the swap state");
  }
  if (clearance.freshAttestation.factId !== disputedAttestation.factId) {
    throw new Error("A fresh attestation may only clear staleness for the exact same canonical fact");
  }
  if (clearance.freshAttestation.evidenceId === clearance.staleEvidenceId) {
    throw new Error("The fresh attestation must be a distinct evidence record");
  }
  const legState = state[clearance.leg];
  const collection = clearance.evidenceKind === "funding" ? legState.fundingAttestations : legState.spendAttestations;
  if (collection?.some((item) => item.evidenceId === clearance.freshAttestation.evidenceId)) {
    throw new Error("The fresh attestation is already present in the evidence set");
  }

  const key = clearance.evidenceKind === "funding" ? "fundingAttestations" : "spendAttestations";
  const nextLegState = Object.freeze({
    ...legState,
    [key]: Object.freeze([...(collection ?? []), Object.freeze(clearance.freshAttestation)]),
  });
  const remainingDisputes = state.disputes.filter((dispute) => dispute !== stale);
  return assertSwapStateIntegrity(Object.freeze({
    ...state,
    [clearance.leg]: nextLegState,
    disputes: Object.freeze(remainingDisputes),
  }));
}

/**
 * Hard disputes (observer-conflict, semantic-mismatch) are never cleared by
 * this module. They resolve only through the explicit retraction-and-
 * replacement flow already present in swap-state.ts. This function exists so
 * callers can ask the policy instead of re-deriving it.
 */
export function disputeRequiresExplicitRetraction(reason: "observer-conflict" | "semantic-mismatch"): true {
  void reason;
  return true;
}
