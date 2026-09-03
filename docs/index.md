# Phlebas documentation index

The Phlebas documentation is organized as follows. Each link opens
the corresponding file in the docs tree.

## Architecture and decisions

- [ARCHITECTURE.md](ARCHITECTURE.md) — the layered architecture
- [PRODUCT_SPEC.md](PRODUCT_SPEC.md) — the product specification
- [ADR index](adr/) — accepted decisions and implementation notes

  Two numbers were each issued twice, so a bare "ADR 0002" or "ADR 0003"
  does not identify a document. Cite the filename. Renumbering would
  break every inbound link, including the ones in `README.md`.

  - [0001 Arbitrum and pZEC](adr/0001-arbitrum-and-pzec.md) — superseded
  - [0002 native ZEC atomic settlement](adr/0002-native-zec-atomic-settlement.md) — the active settlement architecture
  - [0002 native ZEC against USDC and USDT](adr/0002-native-zec-usdc-usdt.md)
  - [0003 EVM conditional lock](adr/0003-evm-conditional-lock.md)
  - [0003 persistent native matcher](adr/0003-persistent-native-matcher.md) — the matcher boundary `README.md` cites
  - [0004 atomic-swap state machine](adr/0004-atomic-swap-state-machine.md)
  - [0005 Zcash P2SH atomic swap](adr/0005-zcash-p2sh-atomic-swap.md)
  - [0005 implementation notes](adr/0005-impl-notes.md)
  - [0006 atomic-swap observer](adr/0006-atomic-swap-observer.md)
  - [0006 implementation notes](adr/0006-impl-notes.md)
  - [0007 public market data](adr/0007-public-market-data.md)
  - [0007 implementation notes](adr/0007-impl-notes.md)
  - [0008 operations hardening](adr/0008-operations-hardening.md)
  - [0008 implementation notes](adr/0008-impl-notes.md)
  - [0009 final integration and audit prep](adr/0009-final-integration-audit.md)
  - [0009 implementation notes](adr/0009-impl-notes.md)

## Operations and runbooks

- [OPERATIONS.md](OPERATIONS.md) — operations overview
- [OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md) — operator runbook
- [THREAT_MODEL.md](THREAT_MODEL.md) — threat model with 21 sections
- [SOURCES.md](SOURCES.md) — source references
- [runbooks/](runbooks/) — per-surface restart runbooks
  - [runbooks/observer-restart.md](runbooks/observer-restart.md)
  - [runbooks/swap-coordinator-storage.md](runbooks/swap-coordinator-storage.md) — local canonical storage and recovery boundaries
  - [runbooks/market-data-restart.md](runbooks/market-data-restart.md)
- [operations/](operations/) — per-surface SLOs
  - [operations/observer-slo.md](operations/observer-slo.md)
  - [operations/market-data-slo.md](operations/market-data-slo.md)

## Delivery and product

- [DELIVERY_PLAN.md](DELIVERY_PLAN.md) — delivery plan
- [MAINNET_DEPLOYMENT.md](MAINNET_DEPLOYMENT.md) — mainnet settlement deployment runbook
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
