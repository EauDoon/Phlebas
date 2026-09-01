# ADR 0009: Final integration and audit prep

Date: 01-09-2026
Status: Accepted for key-independent development
Production status: Not approved

## Context

Seven historical PRs delivered key-independent components of the
native-ZEC exchange prototype. That work did not complete production
settlement authority. Term-bound EVM locks, strict Zcash spend evidence,
matcher-to-signed-terms binding, journal-backed observers, security review,
and operational approval remain unresolved release gates.

The release-readiness command is a fail-closed evidence summary, not an
independent grant of production authority. It combines automated checks
(lint, typecheck, tests, contracts, secret scan, and build) with the manual
audit checklist. Every required gate must pass; a skip, missing result, or
incomplete checklist keeps the verdict not ready.

## Decision

The new final integration surface is a set of two pure-function
libraries and a set of three documents:

1. **`src/lib/release-readiness.ts`** — a release readiness gate
   that evaluates a collection of per-gate results into a
   single verdict. The gate is a pure function over a
   collection of gate results. The gate never reaches out to
   the network.

2. **`src/lib/audit-checklist.ts`** — an audit checklist with
   required, blocked, and owner tracking. The checklist is a
   pure data structure. The checklist is consumed by the
   release readiness gate.

3. **`docs/audit/audit-checklist.md`** — the canonical audit
   checklist for the project. The checklist is the input to
   the release readiness gate.

4. **`docs/audit/release-readiness-evidence.md`** — the release
   readiness evidence pack. The pack is regenerated on every
   release. The pack is the single source of truth for the
   release verdict.

5. **`docs/audit/final-integration-report.md`** — the final
   integration report. The report summarizes the seven PRs
   that delivered the key-independent components.

The release readiness gate is the only manual gate in the pack.
All other gates are automated. The on-call engineer's sign-off
is recorded in the deploy channel in the team chat.

## Consequences

* The release verdict is reproducible from the project root.
* The audit checklist is the canonical record of the audit
  surface.
* The evidence pack is the single source of truth for the
  release verdict.
* The final integration report is the single source of truth
  for the seven PRs that delivered the project.

## Out of scope

* Production value movement remains prohibited until the unresolved
  settlement, audit, legal, signer, monitoring, and incident gates have
  current written evidence. Deployment credentials do not satisfy those
  gates.
* The audit team's review. The audit team reviews the audit
  checklist and signs off on the release; the audit team's
  review is a manual gate.

## Related

* ADR 0001-0008: the seven PRs that delivered the project.
* ADR 0006: atomic-swap observer. The observer is the second
  half of the read-only surface; the audit checklist includes
  observer-specific items.
* ADR 0007: public market data. The public market data surface
  is the public read-only surface; the audit checklist includes
  market-data-specific items.
* ADR 0008: operations hardening. The operations hardening
  surface is the single source of truth for the operator's
  on-call rotation; the audit checklist includes
  operations-specific items.
