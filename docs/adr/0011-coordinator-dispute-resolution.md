# ADR 0011: Coordinator dispute resolution policy

Status: Proposed (implemented behind a disabled activation gate; requires the
independent review in `docs/audit/open-items.md` row contracts-11 before
activation)

Related: review-4 defect record in `docs/audit/open-items.md`; owner direction
2026-09-06.

## Context

`flagSwapDispute` can place four kinds of dispute on a swap:
`observer-conflict`, `observer-stale`, `reorganization`, and
`semantic-mismatch`. Today only `reorganization` disputes can clear, through
the explicit evidence-replacement resolution graph
(`retractSwapEvidence` + `replaceSwapFundingAttestation`/`replaceSwapSpendAttestation`).
The other three have no resolution transition at all, so a single observer
disagreement permanently blocks the coordinator's observation and confirmation
of that swap.

Two invariants bound any change:

1. **No authority expansion.** Dispute resolution never moves funds, never
   force-settles a swap, never redirects a payout, and never overrides
   contradictory evidence by fiat. It only re-enables the coordinator's
   observation and confirmation of facts that newly verified evidence
   supports.
2. **Wallet recovery is independent.** Every wallet-controlled timeout refund
   is executed on the chains against the locks' own deadlines. Coordinator
   dispute state does not gate those on-chain actions today and must never
   gate them: an operator who cannot clear a dispute must not be able to hold
   a funder's refund hostage.

## Decision

Disputes are classified into transient (clearable by newly verified evidence,
under the same signed observer policies the evidence itself must satisfy) and
hard (never cleared automatically).

### Transient

- **`observer-stale`** — the disputed attestation failed the evidence policy's
  freshness window, a time failure rather than a content contradiction. It
  clears when a fresh, policy-qualified attestation **of the same canonical
  fact** (`factId` equality) is observed from an approved source, and **no**
  `observer-conflict` or `semantic-mismatch` dispute exists on the same
  evidence. The fresh attestation is appended; the stale dispute is removed;
  the audit graph records nothing about a retraction because nothing was
  retracted — the disputed attestation remains in the evidence set and stays
  stale by policy.

### Hard

- **`observer-conflict`** — two approved observers reported different chain
  views at the same height. That is a content contradiction. It clears only
  through the existing explicit retraction-and-replacement resolution flow
  after an operator chooses which report to retract; the resolution is a
  permanent audit-graph edge. No automatic transition exists.
- **`semantic-mismatch`** — observed content failed validation against the
  swap's canonical terms. A malformed report is transient in nature, but the
  state machine cannot distinguish "malformed report" from "contradictory
  valid content" after the fact, so it is treated as hard and clears only
  through the explicit retraction-and-replacement flow.
- **`reorganization`** — unchanged: resolved by the existing explicit
  replacement flow.

### Activation

Both new code paths ship behind a disabled activation gate
(`DISPUTE_RESOLUTION_ACTIVATION`, currently `"disabled"`). While disabled,
every transition throws and the machine behaves exactly as before the change.
Activation requires the independent security review of this ADR and the
implementation, after which the gate flips to `"enabled"` as a one-line,
reviewed change.

## Consequences

- A swap with only a stale-observation dispute can resume coordinated
  progress once fresh evidence for the same fact exists, instead of being
  permanently stuck.
- Hard contradictions persist across retries, restarts, and timeouts by
  construction; tests pin that no automatic transition can clear them.
- `assertNotDisputed` continues to gate coordinator funding/claim mutations,
  and `swapPhase` continues to report `disputed` while any dispute remains.
- The wallet's on-chain refund path is unaffected by this ADR; a follow-up
  assertion in the tests documents that coordinator disputes leave fund facts,
  refund deadlines, and the phase-recovery surface intact.
