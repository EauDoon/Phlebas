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
| tests | pass | 1,414 Node tests pass (unit, services, matcher, and signed-order evidence) |
| manifests | pass | Manifest and mutation tests pass within the Node suite |
| contract-build | pass | Exact ConditionalLock target builds |
| contracts | pass | 67 Foundry tests pass across 7 suites |
| secret-scan | pass | 599 tracked files scanned with no detected secrets |
| build | pass | Next.js production build succeeds with 15 routes |
| browser acceptance | pass | 338 Playwright tests pass against the production build |
| audit-checklist | fail | 15 of 47 required items remain incomplete |

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
* `docs-6`: publish exact-release evidence on every release.
* `contracts-10`, `contracts-11`, `services-9` to `services-12`,
  `operations-7` to `operations-9`, `keys-2`, `keys-5`, `keys-6`,
  `compliance-1`, and `compliance-2` remain as listed below.
* `keys-2`, `keys-5`, and `keys-6`: establish key separation and complete
  the wallet signing and broadcast design and independent review.
* `compliance-1` and `compliance-2`: obtain legal approval and implement
  the resulting jurisdiction, disclosure, privacy, sanctions, and
  incident controls.

These rows are minimum checklist blockers, not a claim that every other
production dependency is already satisfied. New audit findings must be
added to the canonical checklist and resolved before the verdict can
become ready.

## Candidate deployment identity

| Field | Value |
| --- | --- |
| Candidate commit | `6c02750` (merge of PR #70, `fix/trusted-proxy-rate-limit-identity`) |
| Production deployment | `https://phlebas-26uld56cb-dan-o.vercel.app` (Ready) |
| Public origin | `https://phlebas.vercel.app` |
| Deployed | 2026-09-05, created at the exact merge push of the candidate commit by the repository's GitHub-connected Vercel project |
| Browser evidence for this candidate | `npm run test:browser`: 338/338 passed in CI on the merge commit |
| Per-pull-request previews | Green Vercel preview checks on PR #69 and PR #70 |

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

Browser acceptance is separate promotion evidence and passed for the
current candidate commit. A later candidate must rerun it:

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
