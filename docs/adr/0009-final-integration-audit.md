# ADR 0009: Final integration and audit prep

Date: 01-09-2026
Status: Accepted for key-independent development
Production status: Not approved

## Context

The Phlebas project is composed of seven PRs that delivered the
key-independent components of the native-ZEC atomic swap
exchange. The project is at the end of the key-independent
build phase. The next phase is the production deployment, which
requires the project to pass a release readiness gate.

The release readiness gate is the single source of truth for
whether the project is ready to ship to production. The gate is
composed of automated checks (lint, typecheck, tests,
secret-scan, build) and manual checks (audit checklist, on-call
sign-off). The gate is reproducible from the project root.

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

* The production deployment. The production deployment is a
  separate concern; the production deploy key, the production
  wallet adapter, and the production PagerDuty / Slack
  integration are deployment-time concerns.
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
