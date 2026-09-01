# Release readiness evidence snapshot

This file records the latest reproducible local evidence for the
Phlebas release gate. It is not a substitute for the canonical audit
checklist, deployment evidence, or an exact-commit production approval.

## Gates

| Gate | Status | Detail |
| --- | --- | --- |
| lint | pass | ESLint completes with 0 errors and 0 warnings |
| contract-format | pass | Foundry formatting is exact |
| typecheck | pass | TypeScript completes with 0 errors |
| tests | pass | 801 Node tests pass |
| manifests | pending exact commit | Working-tree validation passes; deployed-manifest source identity requires the merge commit |
| contract-build | pass | Exact ConditionalLock target builds at 3,808 runtime bytes |
| contracts | pass | 70 Foundry tests pass |
| secret-scan | pass | 435 files scanned with no detected secrets |
| build | pass | Next.js production build succeeds with 15 routes |
| browser acceptance | pass | 231 Playwright tests pass against the production build |
| audit-checklist | fail | 16 of 47 required items remain incomplete |

## Verdict

The current verdict is **not ready**. The incomplete required audit
items are:

* `contracts-10` and `contracts-11`: deploy and verify the exact reviewed
  contract on the approved test network, then complete independent
  contract and protocol review.
* `services-9` to `services-12`: complete strict Zcash and EVM chain
  evidence, canonical matcher terms, and durable authoritative journals.
* `operations-7` to `operations-9`: wire production alerting and metrics,
  then produce complete testnet claim, refund, failure, and recovery
  evidence.
* `docs-6` and `docs-7`: publish exact-release evidence and bind a green
  Vercel preview to the candidate commit.
* `keys-2`, `keys-5`, and `keys-6`: establish key separation and complete
  the wallet signing and broadcast design and independent review.
* `compliance-1` and `compliance-2`: obtain legal approval and implement
  the resulting jurisdiction, disclosure, privacy, sanctions, and
  incident controls.

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
