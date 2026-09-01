# Release readiness evidence snapshot

This file records the latest reproducible local evidence for the
Phlebas release gate. It is not a substitute for the canonical audit
checklist, deployment evidence, or an exact-commit production approval.

## Gates

| Gate | Status | Detail |
| --- | --- | --- |
| lint | pass | ESLint completes with 0 errors and 0 warnings |
| typecheck | pass | TypeScript completes with 0 errors |
| tests | pass | 807 Node tests pass |
| contracts | pass | 49 Foundry tests pass |
| secret-scan | pass | 423 files scanned with no detected secrets |
| build | pass | Next.js production build succeeds with 15 routes |
| browser acceptance | pass | 231 Playwright tests pass against the production build |
| audit-checklist | fail | 7 of 36 required items remain incomplete |

## Verdict

The current verdict is **not ready**. The incomplete required audit
items are:

* `contracts-1` and `contracts-2`: deploy the exact reviewed contract
  bytecode to Arbitrum Sepolia, record it in the manifest, and verify it
  on the block explorer.
* `operations-7`: wire and exercise the production alert destination.
* `operations-8`: wire and exercise the production metrics destination.
* `docs-6`: publish an evidence pack bound to the exact release commit
  and deployed artifact.
* `keys-2`: establish and verify separation between test and production
  deployment authority.
* `keys-5`: document and independently review any wallet signing surface
  before it is enabled.

These rows are minimum checklist blockers, not a claim that every other
production dependency is already satisfied. New audit findings must be
added to the canonical checklist and resolved before the verdict can
become ready.

## Reproduction

Run the individual technical gates from the repository root:

```sh
npm run lint
npm run typecheck
npm test
npm run test:contracts
npm run scan:secrets
npm run build
```

Run the combined fail-closed gate with:

```sh
node scripts/release-readiness.mjs
```

Browser acceptance is separate promotion evidence and passed for this
working-tree snapshot. It must be rerun on the exact release commit:

```sh
npm run test:browser
```

The audit status is parsed from `docs/audit/audit-checklist.md`. The gate
identities and release verdict are evaluated by
`src/lib/release-readiness.ts`. Missing or duplicate required gate
identities fail closed.

## Approval boundary

Operator sign-off records approval only after every required gate is
satisfied. It cannot override a failing, missing, duplicate, skipped, or
unverified gate.
