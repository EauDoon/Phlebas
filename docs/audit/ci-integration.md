# CI integration

This document describes how the release readiness gate is
integrated into the CI pipeline. The integration is the
single source of truth for the CI surface.

## Pipeline

1. The CI runner pulls the latest commit on `main`.
2. The CI runner runs the release readiness script:
   `node scripts/release-readiness.mjs`.
3. The script prints the release verdict as a JSON document.
4. The CI runner fails the build if the verdict is `not ready`.
5. The CI runner posts the verdict to the deploy channel.

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

## Local skip

The `contracts` gate is `skip` locally and `pass` in CI. The
`skip` status indicates that the gate was not run locally; the
CI workflow installs Foundry and runs the gate.

## On-call sign-off

The on-call engineer signs off on the release verdict in the
deploy channel. The sign-off is the only manual gate in the
release verdict.

## Out of scope

* The production deploy. The production deploy is a separate
  concern; the production deploy key, the production wallet
  adapter, and the production PagerDuty / Slack integration
  are deployment-time concerns.
* The audit team's review. The audit team reviews the audit
  checklist and signs off on the release; the audit team's
  review is a manual gate.
