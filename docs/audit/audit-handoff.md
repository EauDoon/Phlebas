# Audit handoff

This document is the operator-facing handoff for the audit
team. The handoff is the single source of truth for the audit
team's review.

## Scope

The audit covers the seven PRs that delivered the
key-independent components of the native-ZEC atomic swap
exchange. The audit does not cover the production deployment
or the production wallet adapter.

## Deliverables

The audit team receives the following deliverables:

* the per-PR summary at `docs/per-pr-summary.md`
* the audit checklist at `docs/audit/audit-checklist.md`
* the release readiness evidence pack at
  `docs/audit/release-readiness-evidence.md`
* the final integration report at
  `docs/audit/final-integration-report.md`
* the threat model at `docs/THREAT_MODEL.md`
* the architecture doc at `docs/ARCHITECTURE.md`
* the ADRs at `docs/adr/`
* the runbooks at `docs/runbooks/`
* the operations dashboard at
  `docs/operations/operations-dashboard.md`

## Process

1. The security team schedules the audit at least two weeks
   in advance.
2. The on-call engineer prepares the audit deliverables using
   the audit prep runbook.
3. The audit team reviews the deliverables and produces a
   findings report.
4. The on-call engineer addresses the findings and updates
   the audit checklist.
5. The security team signs off on the audit and the release
   verdict is updated to `ready`.

## Out of scope

* The production deployment. The production deployment is a
  separate concern; the production deploy key, the production
  wallet adapter, and the production PagerDuty / Slack
  integration are deployment-time concerns.
* The release notes for the production deploy.
