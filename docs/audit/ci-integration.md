# CI integration

This document describes how the release readiness gate is
integrated into the CI pipeline. The integration is the
single source of truth for the CI surface.

## Pipeline

1. The CI runner checks out the exact pull-request or `main`
   commit without persisting credentials.
2. The runner installs locked Node dependencies, Foundry
   1.8.1, and Playwright Chromium.
3. The runner executes `npm run check` and then
   `npm run test:browser`.
4. Any failed application, manifest, contract, secret-scan,
   build, or browser gate fails the Verify workflow.
5. `node scripts/release-readiness.mjs` is a separate operator
   aggregation. It runs the automated gates again, includes the
   audit checklist, and remains not ready while required audit
   items are open.

## Gates

The release readiness script runs the following gates:

| Gate | Command | Pass criteria |
| --- | --- | --- |
| lint | `npm run lint` | 0 errors |
| contract-format | `npm run lint:contracts` | Foundry formatting is exact |
| typecheck | `npm run typecheck` | 0 errors |
| tests | `npm test` | all node tests pass |
| manifests | `npm run test:manifests` | undeployed and deployment evidence fail closed |
| contract-build | `npm run build:contracts` | exact target builds within size limits |
| secret-scan | `npm run scan:secrets` | no findings |
| build | `npm run build` | Next.js production build succeeds |
| contracts | `npm run test:contracts` | all Foundry tests pass |
| audit-checklist | parses `docs/audit/audit-checklist.md` | all required items `done` |

## Local requirements

The aggregation does not treat a missing contract toolchain as
ready. Node 24, locked dependencies, and Foundry 1.8.1 must be
available or their gates fail.

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
