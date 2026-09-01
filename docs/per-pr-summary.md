# Per-PR summary

This document summarizes each of the seven PRs that delivered
the key-independent components of the native-ZEC atomic swap
exchange. The summary is the input to the final integration
report.

## PR 1 — EVM conditional-lock contracts (10 commits)

| Aspect | Detail |
| --- | --- |
| Branch | `feat/evm-conditional-lock` |
| Merged at | `0075693` |
| Files | 6 |
| Insertions | 320 |
| Surface | ConditionalLock contract, Foundry test suite, deployment script, ABI, threat model section 18 |

## PR 2 — Atomic-swap state machine (8 commits)

| Aspect | Detail |
| --- | --- |
| Branch | `feat/atomic-swap-state-machine` |
| Merged at | `c41b128` |
| Files | 6 |
| Insertions | 380 |
| Surface | State machine, preimage primitive, swap state panel, `/swap` view, threat model section 18 |

## PR 3 — Historical Zcash HASH160 display helpers (40 commits)

This historical PR is superseded by `docs/ZCASH_TRANSACTION_LAB.md`. Its transaction-shaped values are incomplete synthetic displays, not transactions or a wallet adapter.

| Aspect | Detail |
| --- | --- |
| Branch | `feat/zcash-p2sh-wallet-adapter` |
| Merged at | `c605343` |
| Files | 39 |
| Insertions | 2237 |
| Surface | RIPEMD160 wrapper, SHA256d, Base58Check, Zcash script builder, P2SH atomic-swap script, wallet adapter, address encoder, `/zcash` route, threat model section 19 |

## PR 4 — Read-only observers, persistent coordinator, watchtower (42 commits)

| Aspect | Detail |
| --- | --- |
| Branch | `feat/atomic-swap-observer` |
| Merged at | `3b7d9c0` |
| Files | 40 |
| Insertions | 2827 |
| Surface | EVM observer, ZEC observer, event reducers, transition mapper, coordinator, snapshot, persistence, watchtower, reorg detector, integrity check, atomic-swap observer service, threat model section 20 |

## PR 5 — Public market data (30 commits)

| Aspect | Detail |
| --- | --- |
| Branch | `feat/matcher-public-market-data` |
| Merged at | `c27e3c2` |
| Files | 25 |
| Insertions | 1554 |
| Surface | Public market data lib, formatters, combined snapshot, rate limiter, matcher `/ticker` `/trades` `/depth` `/markets` `/snapshot` `/version` endpoints, threat model section 21 |

## PR 6 — Operations hardening (30 commits)

| Aspect | Detail |
| --- | --- |
| Branch | `feat/operations-hardening` |
| Merged at | `ae30ca2` |
| Files | 27 |
| Insertions | 1335 |
| Surface | Metrics counter, SLO tracker, health aggregator, alert router, log formatter, matcher and observer `/metrics` and `/slo` endpoints, incident-response, pre-deploy, and post-deploy runbooks, operations dashboard, threat model section 22 |

## PR 7 — Final integration and audit prep (TBD commits)

| Aspect | Detail |
| --- | --- |
| Branch | `feat/final-integration-audit` |
| Files | TBD |
| Insertions | TBD |
| Surface | Release readiness gate, audit checklist, evidence pack, final integration report, ADR 0009, threat model section 23 |

## PR 8 — Rate limiter wiring (7 commits)

| Aspect | Detail |
| --- | --- |
| Branch | `feat/rate-limit-wiring` |
| Files | 12 |
| Insertions | 408 |
| Surface | Per-IP rate limiter middleware, wiring into matcher and observer services, tests, audit checklist updates |

## PR 9 — 320px skip-nav wrap (TBD commits)

| Aspect | Detail |
| --- | --- |
| Branch | `feat/skip-nav-wrap` |
| Files | TBD |
| Insertions | TBD |
| Surface | Skip-nav wrap at 320px, activation state, docs, runbook, SLO, threat model section, architecture, sources |
