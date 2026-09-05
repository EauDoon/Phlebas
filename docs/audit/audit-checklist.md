# Audit checklist

This document is the canonical audit checklist for the Phlebas
project. The checklist tracks the items the security team must
verify before the project can ship to production. The checklist
is the input to the release readiness gate.

## Contracts

| ID | Item | Required | Owner | Status |
| --- | --- | --- | --- | --- |
| contracts-1 | ConditionalLock undeployed manifest is network-neutral and rejects deployment evidence until separately recorded | yes | contracts | done |
| contracts-2 | ConditionalLock manifest keeps all network actions disabled, including after deployment evidence is recorded | yes | contracts | done |
| contracts-3 | Foundry test suite passes in CI | yes | contracts | done |
| contracts-4 | Contract sources have no upgradeable proxies or admin transfer paths | yes | contracts | done |
| contracts-5 | ConditionalLock has no owner, governor, pauser, unpause, upgrade, or rescue authority | yes | contracts | done |
| contracts-6 | Refund path is covered by Foundry tests | yes | contracts | done |
| contracts-7 | Zcash P2SH lock scripts are validated against canonical ZIP-300 vectors | yes | contracts | done |
| contracts-8 | Zcash script builder is deterministic and round-trips through the parser | yes | contracts | done |
| contracts-9 | Preimage primitive produces 32 random bytes in the browser and SHA-256s in Node | yes | contracts | done |
| contracts-10 | Exact reviewed ConditionalLock bytecode is deployed to the approved test network and its receipt, constructor, runtime, source verification, chain, and address are recorded in the validated manifest | yes | contracts | todo |
| contracts-11 | Independent contract and cross-chain protocol security review is complete for the exact release artifact | yes | security | todo |

## Services

| ID | Item | Required | Owner | Status |
| --- | --- | --- | --- | --- |
| services-1 | Matcher service signs no transactions and holds no keys | yes | services | done |
| services-2 | Atomic-swap observer signs no transactions and holds no keys | yes | services | done |
| services-3 | Public market data endpoints never expose the operator's internal state | yes | services | done |
| services-4 | All services expose `/health` and return 503 on a missing-after-init snapshot | yes | services | done |
| services-5 | All services expose `/metrics` and `/slo` | yes | services | done |
| services-6 | Marker file is written on first successful bootstrap and the service refuses to start fresh if the marker is present and the snapshot is missing | yes | services | done |
| services-7 | Rate limiter is applied to public endpoints | yes | services | done |
| services-8 | Per-IP rate limit is enforced at the HTTP layer | yes | services | done |
| services-9 | Zcash settlement evidence proves the actual transparent input spend, executed branch, witness or preimage, destination, and finality without height-only inference | yes | services | todo |
| services-10 | EVM settlement evidence validates the approved chain, contract, ABI topics, data, receipt, and finality against the exact deployed lock | yes | services | todo |
| services-11 | Each matched fill derives one canonical signed `SwapTermsV1`, swap ID, terms hash, integer quote amount, and fee commitment consumed identically by both legs | yes | services | todo |
| services-12 | Authoritative settlement journals are durable, replayable, idempotent, reorganization-tested, and isolated from diagnostic observer projections | yes | services | todo |

## Operations

| ID | Item | Required | Owner | Status |
| --- | --- | --- | --- | --- |
| operations-1 | Per-service SLO is documented in `docs/operations/` | yes | operations | done |
| operations-2 | Per-service restart runbook is documented in `docs/runbooks/` | yes | operations | done |
| operations-3 | Cross-service incident response runbook is documented | yes | operations | done |
| operations-4 | Pre-deploy and post-deploy runbooks are documented | yes | operations | done |
| operations-5 | Operations dashboard tracks per-service SLOs, alert routing, and runbook index | yes | operations | done |
| operations-6 | Watchtower alert classes are documented with severity, channel, and source | yes | operations | done |
| operations-7 | PagerDuty / Slack integration is wired to the alert router | yes | operations | todo |
| operations-8 | Prometheus remote-write adapter is wired to the metrics counter | yes | operations | todo |
| operations-9 | Exact-artifact testnet evidence covers claim, refund, expiry, reorganization, conflicting evidence, recovery, and wrong-network journeys | yes | operations | todo |

## Documentation

| ID | Item | Required | Owner | Status |
| --- | --- | --- | --- | --- |
| docs-1 | All ADRs are linked from `docs/index.md` | yes | docs | done |
| docs-2 | Threat model has a section per surface (EVM lock, ZEC leg, observer, market data, operations) | yes | docs | done |
| docs-3 | Sources are linked from `docs/SOURCES.md` | yes | docs | done |
| docs-4 | Operations dashboard is the single source of truth for SLOs, alerts, and runbooks | yes | docs | done |
| docs-5 | Audit checklist is the canonical record of the audit surface | yes | docs | done |
| docs-6 | Release readiness evidence pack is published on every release | yes | docs | todo |
| docs-7 | The exact candidate commit has a green Vercel preview and its deployment identity and browser evidence are recorded | yes | docs | done |

## Key management

| ID | Item | Required | Owner | Status |
| --- | --- | --- | --- | --- |
| keys-1 | This undeployed workstream requires and stores no deployment key | yes | security | done |
| keys-2 | Project deploy key has no production keys; production deploys use a separate key | yes | security | todo |
| keys-3 | User wallets never connect to the production services; the production services are read-only on the user side | yes | security | done |
| keys-4 | Wallet adapter signing surface is not active in the testnet | yes | security | done |
| keys-5 | Wallet adapter signing surface is documented for the production deploy | yes | security | todo |
| keys-6 | Production wallet signing and broadcast paths are independently reviewed and remain disabled unless the exact deployment manifest is approved | yes | security | todo |

## Legal and compliance

| ID | Item | Required | Owner | Status |
| --- | --- | --- | --- | --- |
| compliance-1 | Counsel has approved the exchange model, supported jurisdictions, required registrations, and operator obligations | yes | legal | todo |
| compliance-2 | Approved access controls, disclosures, terms, privacy, sanctions, and incident obligations are implemented and verified | yes | legal | todo |
