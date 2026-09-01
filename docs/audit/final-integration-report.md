# Final integration report

This document is the final integration report for the Phlebas
project. The report summarizes the seven PRs that delivered the
key-independent components of the native-ZEC atomic swap
exchange.

## PR summary

| PR | Branch | Commits | Files | Insertions | What landed |
| --- | --- | --- | --- | --- | --- |
| PR 1 | `feat/evm-conditional-lock` | 10 | 6 | 320 | EVM conditional-lock contracts (Solidity) |
| PR 2 | `feat/atomic-swap-state-machine` | 8 | 6 | 380 | Atomic-swap state machine + `/swap` view |
| PR 3 | `feat/zcash-p2sh-wallet-adapter` | 40 | 39 | 2237 | Zcash P2SH tx lab and wallet adapter |
| PR 4 | `feat/atomic-swap-observer` | 42 | 40 | 2827 | Read-only observers, persistent coordinator, watchtower |
| PR 5 | `feat/matcher-public-market-data` | 30 | 25 | 1554 | Public market data lib + matcher HTTP endpoints |
| PR 6 | `feat/operations-hardening` | 30 | 27 | 1335 | Operations hardening: metrics, SLO, health aggregator, alert router, log format |
| PR 7 | `feat/final-integration-audit` | TBD | TBD | TBD | Final integration, audit prep, production gate evidence pack |

## Key-independent coverage

The seven PRs cover every key-independent component of the
native-ZEC atomic swap exchange:

* **EVM leg**: one non-upgradeable, exact-token ConditionalLock
  with immutable swap terms, no administrative roles or pause
  path, and a Foundry test suite.
* **ZEC leg**: transparent P2SH lock script, ZIP-300 atomic-swap
  script, preimage primitive, wallet adapter with
  `buildFundTransaction`, `buildClaimTransaction`,
  `buildRefundTransaction`, and `hashAtomicSwapParams`.
* **State machine**: 11 states, 9 transitions, per-role
  `nextAction` for buyer, seller, and watcher.
* **Observers**: EVM observer for ConditionalLock events, ZEC
  observer for P2SH outpoints, event reducers, transition
  mapper, persistent coordinator, watchtower, snapshot
  integrity check, reorg detector.
* **Public market data**: ticker, trades, depth, markets,
  snapshot, version endpoints on the matcher service, plus
  formatters, combined snapshot, and rate limiter libs.
* **Operations**: in-memory metrics with Prometheus text
  rendering, SLO tracker with rolling-window compliance verdict,
  health aggregator, alert router with default routing table,
  structured log formatter.
* **Final integration**: release readiness gate, audit
  checklist, evidence pack.

The signing surface is intentionally absent. The wallet
adapter's `buildFundTransaction`, `buildClaimTransaction`, and
`buildRefundTransaction` return unsigned transactions. The
signing surface is the only gated step.

## Test coverage

The exact test counts are emitted by `npm run check` and the
GitHub Verify workflow. The Foundry suite in `contracts/test/`
runs both locally and in CI and covers ConditionalLock.

## Documentation

The project ships 27 markdown files under `docs/`:

* 8 ADRs (0001-0008) and 3 implementation notes
* 5 runbooks (incident-response, pre-deploy, post-deploy,
  observer-restart, market-data-restart)
* 3 operations docs (observer-slo, market-data-slo,
  operations-dashboard)
* 3 core docs (ARCHITECTURE, THREAT_MODEL, SOURCES)
* 5 product docs (DELIVERY_PLAN, LAUNCH_PLAN,
  LANDING_AND_USER_JOURNEYS, LEGAL_AND_COMPLIANCE,
  LICENSE_CHOICE)
* 3 supporting docs (WALLET_COMPATIBILITY, BROWSER_ACCEPTANCE,
  ASSET_AND_ACCOUNTING)
* 1 operations changelog
* 1 audit checklist
* 1 release readiness evidence pack
* 1 final integration report (this file)
* 1 docs index

## What ships next

After this PR, the only remaining work is the production
deployment, which is intentionally out of scope. The production
deployment requires:

* a separately authorized no-value test-network deployment of
  the exact reviewed ConditionalLock commit, recorded in the
  verified deployment manifest;
* a real Zcash testnet connection for the observer;
* the PagerDuty / Slack integration for the alert router;
* the Prometheus remote-write adapter for the metrics counter;
* the production deploy key and the wallet adapter production
  signing surface.

These items are tracked in `docs/audit/audit-checklist.md` and
must be completed before the production gate is ready.
