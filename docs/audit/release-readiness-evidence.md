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
| tests | pass | 612 node tests pass |
| contracts | skip | Foundry not installed locally; CI runs the suite |
| secret-scan | pass | 355 files clean |
| build | pass | Next.js production build succeeds |
| audit-checklist-required-incomplete | 7 of 26 items incomplete |
| audit-checklist-blocked | 0 items blocked |

## Verdict

The current verdict is **not ready**. The seven incomplete items
in the audit checklist are:

* contracts-1, contracts-2: the contract deployment to Arbitrum
  Sepolia is a deployment-time concern. The contract sources are
  in `contracts/src/swap/`; the deployment manifest is in
  `infra/testnet/`.
* services-7, services-8: the per-IP rate limiter is not wired
  into the HTTP layer. The rate limiter is in
  `src/lib/rate-limit.ts`; the HTTP layer is in
  `services/matcher/server.ts` and
  `services/atomic-swap-observer/server.ts`.
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

## Reproducibility

The gates are reproducible from the project root:

```sh
npm run lint
npm run typecheck
npm test
npm run scan:secrets
npm run build
```

The `contracts` gate is `skip` locally and `pass` in CI. The
CI run is at `.github/workflows/contracts.yml`; the workflow
installs Foundry, runs `forge test --root contracts`, and
reports the result to the release readiness gate.

The `audit-checklist-*` gates are derived from
`docs/audit/audit-checklist.md` and the
`src/lib/audit-checklist.ts` lib. The release verdict is
computed by the `src/lib/release-readiness.ts` lib.

## Sign-off

The release readiness gate requires the on-call engineer's
sign-off. The sign-off is recorded in the deploy channel in the
team chat. The sign-off is the only manual gate in the pack; all
other gates are automated.
