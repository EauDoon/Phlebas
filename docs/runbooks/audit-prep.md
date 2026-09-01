# Audit prep runbook

This runbook is the operator-facing procedure for preparing the
project for an external audit. The runbook is intentionally
short; the audit checklist is the canonical record of the audit
surface.

## When to use

Use this runbook when one or more of the following is true:

* the security team has scheduled an external audit;
* the audit checklist has incomplete required items;
* the release verdict is `not ready` because of audit items.

## Steps

1. Read the audit checklist at
   `docs/audit/audit-checklist.md`. The checklist is the
   canonical record of the audit surface.
2. For each incomplete required item, identify the owner and
   the blocker. The owner is the team responsible for the
   item; the blocker is the missing piece.
3. Schedule a working session with the owner to close the
   blocker. The session must produce either a status update
   (`done` or `in-progress`) or a new blocker entry.
4. Update the audit checklist after the working session. The
   checklist is the source of truth for the audit surface.
5. Re-run the release readiness gate. The verdict must be
   `ready` before the audit starts.
6. Notify the security team that the audit is unblocked.

## Rollback

If the audit is canceled or postponed, the audit checklist is
not modified. The checklist is the source of truth for the
audit surface; the audit team's schedule is separate.
