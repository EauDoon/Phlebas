# Release readiness evidence pack

This document is the release readiness evidence pack for the
Phlebas project. The pack is the single source of truth for the
release readiness gate. The pack is regenerated on every
release.

## Gates

| Gate | Status | Detail |
| --- | --- | --- |
| lint | pass | 0 errors, 0 warnings |
| typecheck | pass | 0 errors |
| tests | pass | exact count emitted by the current run |
| manifests | pass | schema, semantics, Git-tree evidence, and undeployed boundary pass |
| contracts | pass | format, exact-target build, and Foundry tests pass |
| secret-scan | pass | exact file count emitted by the current run |
| build | pass | Next.js production build succeeds |
| audit-checklist-required-incomplete | 5 of 26 items incomplete |
| audit-checklist-blocked | 0 items blocked |

## Verdict

The current verdict is **not ready**. The five incomplete items
in the audit checklist are:

* operations-7: the PagerDuty / Slack integration is not wired.
  The alert router is in `src/lib/alert-router.ts`; the
  integration is an operator-time concern.
* operations-8: the Prometheus remote-write adapter is not wired.
  The metrics counter is in `src/lib/metrics.ts`; the adapter is
  a deployment-time concern.
* docs-6: the release readiness evidence pack is published on
  every release, but the pack itself is the source of truth for
  this gate, so the gate can never pass without manual review.
* keys-2, keys-5: the production deploy key and the wallet
  adapter production signing surface are deployment-time
  concerns.

Note: services-7 and services-8 (rate limiter wiring) were
closed in `feat/rate-limit-wiring` (PR 8).

## Reproducibility

The gates are reproducible from the project root:

```sh
npm run lint
npm run lint:contracts
npm run typecheck
npm test
npm run test:manifests
npm run build:contracts
npm run test:contracts
npm run scan:secrets
npm run build
```

The GitHub Verify workflow is in `.github/workflows/ci.yml`.
It pins Foundry 1.8.1, runs `npm run check`, and then runs the
full Chromium acceptance suite. No skipped gate counts as ready.

The `audit-checklist-*` gates are derived from
`docs/audit/audit-checklist.md` and the
`src/lib/audit-checklist.ts` lib. The release verdict is
computed by the `src/lib/release-readiness.ts` lib.

## Sign-off

The release readiness gate requires the on-call engineer's
sign-off. The sign-off is recorded in the deploy channel in the
team chat. The sign-off is the only manual gate in the pack; all
other gates are automated.
