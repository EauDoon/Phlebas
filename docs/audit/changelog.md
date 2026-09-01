# Audit changelog

This file tracks changes to the audit checklist. Each entry
must include the date, the item changed, the previous and new
status, and the reason for the change.

## 01-09-2026 — initial checklist

- 26 items across 5 categories (contracts, services,
  operations, documentation, key management).
- 19 items `done`, 7 items `todo` (all deployment-time).

The initial checklist is the canonical record of the audit
surface. Future PRs will update individual items as the
project progresses through the production deployment.

## 01-09-2026 — checklist baseline recorded

- The audit checklist is committed at
  `docs/audit/audit-checklist.md`.
- The release readiness evidence pack is committed at
  `docs/audit/release-readiness-evidence.md`.
- The release verdict is `not ready` because 7 of 26 required
  items are not done. The 7 items are deployment-time concerns.
- The on-call engineer's sign-off is the only manual gate.
