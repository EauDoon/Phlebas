# Phlebas documentation index

The Phlebas documentation is organized as follows. Each link opens
the corresponding file in the docs tree.

## Architecture and decisions

- [ARCHITECTURE.md](ARCHITECTURE.md) — the layered architecture
- [PRODUCT_SPEC.md](PRODUCT_SPEC.md) — the product specification
- [ADR index](adr/) — accepted decisions and implementation notes
  - [ADR 0001](adr/0001-arbitrum-and-pzec.md) — Arbitrum + pZEC
  - [ADR 0002](adr/0002-native-zec-atomic-settlement.md) — native ZEC atomic settlement
  - [ADR 0003](adr/0003-evm-conditional-lock.md) — EVM conditional lock
  - [ADR 0004](adr/0004-atomic-swap-state-machine.md) — atomic-swap state machine
  - [ADR 0005](adr/0005-zcash-p2sh-atomic-swap.md) — Zcash P2SH atomic swap
  - [ADR 0006](adr/0006-atomic-swap-observer.md) — atomic-swap observer
  - [ADR 0007](adr/0007-public-market-data.md) — public market data

## Operations and runbooks

- [OPERATIONS.md](OPERATIONS.md) — operations overview
- [OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md) — operator runbook
- [THREAT_MODEL.md](THREAT_MODEL.md) — threat model with 21 sections
- [SOURCES.md](SOURCES.md) — source references
- [runbooks/](runbooks/) — per-surface restart runbooks
  - [runbooks/observer-restart.md](runbooks/observer-restart.md)
  - [runbooks/market-data-restart.md](runbooks/market-data-restart.md)
  - [runbooks/session-export.md](runbooks/session-export.md) — session export operator procedure
  - [runbooks/session-roundtrip.md](runbooks/session-roundtrip.md) — session export + import roundtrip procedure
- [operations/](operations/) — per-surface SLOs
  - [operations/observer-slo.md](operations/observer-slo.md)
  - [operations/market-data-slo.md](operations/market-data-slo.md)

## Delivery and product

- [DELIVERY_PLAN.md](DELIVERY_PLAN.md) — delivery plan
- [LAUNCH_PLAN.md](LAUNCH_PLAN.md) — launch plan
- [LANDING_AND_USER_JOURNEYS.md](LANDING_AND_USER_JOURNEYS.md) — landing and user journeys
- [LEGAL_AND_COMPLIANCE.md](LEGAL_AND_COMPLIANCE.md) — legal and compliance
- [LICENSE_CHOICE.md](LICENSE_CHOICE.md) — license choice
- [WALLET_COMPATIBILITY.md](WALLET_COMPATIBILITY.md) — wallet compatibility
- [BROWSER_ACCEPTANCE.md](BROWSER_ACCEPTANCE.md) — browser acceptance
- [ASSET_AND_ACCOUNTING.md](ASSET_AND_ACCOUNTING.md) — asset and accounting
- [ADR 0008](adr/0008-operations-hardening.md) — operations hardening
- [ADR 0009](adr/0009-final-integration-audit.md) — final integration and audit prep

## Audit and release

- [audit/](audit/) — audit checklist, release readiness evidence, final integration report
  - [audit/audit-checklist.md](audit/audit-checklist.md)
  - [audit/release-readiness-evidence.md](audit/release-readiness-evidence.md)
  - [audit/final-integration-report.md](audit/final-integration-report.md)
- [release-notes/](release-notes/) — release notes template
