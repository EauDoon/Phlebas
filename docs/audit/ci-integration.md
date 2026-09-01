# CI integration

This document distinguishes development CI from the separate,
fail-closed release-readiness check. Development CI does not grant
production authority.

## Pipeline

1. The CI runner checks out the exact pull-request or `main` commit.
2. It runs `npm run check` and the locked Chromium browser suite.
3. This verifies development quality only.
4. Before any production promotion, the operator separately runs
   `node scripts/release-readiness.mjs` on the exact candidate commit.
5. A non-ready verdict blocks promotion. No CI result or deploy key can
   override an incomplete required gate.

## Gates

The release readiness script runs the following gates:

| Gate | Command | Pass criteria |
| --- | --- | --- |
| lint | `npm run lint` | 0 errors |
| typecheck | `npm run typecheck` | 0 errors |
| tests | `npm test` | all node tests pass |
| secret-scan | `npm run scan:secrets` | no findings |
| build | `npm run build` | Next.js production build succeeds |
| contracts | CI runs `forge test` | all Foundry tests pass |
| audit-checklist | parses `docs/audit/audit-checklist.md` | all required items `done` |

The current readiness script runs the contract gate locally and in the
release environment. A missing Foundry runtime is a failure, not a skip.

## On-call sign-off

The audit checklist carries the required manual evidence. Operator sign-off
records the verdict but cannot convert a missing, skipped, or failing gate
into a pass.

## Out of scope

* The production deploy. The production deploy is a separate
  concern; the production deploy key, the production wallet
  adapter, and the production PagerDuty / Slack integration
  are deployment-time concerns.
* The audit team's review. The audit team reviews the audit
  checklist and signs off on the release; the audit team's
  review is a manual gate.
