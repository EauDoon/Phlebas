# Per-PR summary (appendix)

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

## PR 9 — 320px skip-nav wrap

| Aspect | Detail |
| --- | --- |
| Branch | `feat/skip-nav-wrap` |
| Stack base | `main` at `46a222b` (rebased off `9367044`) |
| Files | src/components/simulation-frame.tsx, src/components/terminal.module.css, src/lib/skip-nav-state.ts + test, src/lib/skip-nav-restore.ts + test, tests/browser/phlebas.spec.ts, docs/adr/0010-skip-nav-wrap.md, docs/adr/0010-impl-notes.md, docs/adr/0002-native-zec-atomic-settlement.md, docs/runbooks/a11y-test.md, docs/operations/a11y-slo.md, docs/operations/a11y-verdict-history.md, docs/audit/a11y-checklist.md, docs/audit/a11y-changelog.md, docs/audit/open-items.md, docs/THREAT_MODEL.md, docs/ARCHITECTURE.md, docs/SOURCES.md, docs/index.md, PROGRESS.md |
| Insertions | 30+ meaningful commits (rebase absorbed 2 CSS and 2 test commits that were duplicates of upstream) |
| Surface | Skip-nav wrap at 320px, activation state via data-skip-nav-state, lib/skip-nav-state state machine, Playwright tests, docs/adr/0010, docs/runbooks/a11y-test.md, docs/operations/a11y-slo.md, docs/audit/a11y-checklist.md, threat model section 24, architecture section, sources |
| Verifications | `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:browser` (in CI) |
| Out of scope | full accessibility audit, screen reader testing, skip-nav wiring in trading-terminal.tsx |
| Skipped steps | none (no keys or tokens touched) |
