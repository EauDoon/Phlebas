# Operations dashboard

This document is the operations dashboard for the Phlebas
services. The dashboard tracks the per-service SLO targets, the
watchtower's alert surface, the alert routing table, and the
metrics and SLO endpoints exposed by every service.

## Per-service SLO summary

| Service | SLO | Target | Window | Source |
| --- | --- | --- | --- | --- |
| matcher | availability | 99.5% | 30 days | [market-data-slo.md](market-data-slo.md) |
| matcher | latency p95 | 50 ms | 30 days | [market-data-slo.md](market-data-slo.md) |
| matcher | latency p99 | 200 ms | 30 days | [market-data-slo.md](market-data-slo.md) |
| observer | availability | 99.5% | 30 days | [observer-slo.md](observer-slo.md) |
| observer | fill freshness | 1 poll interval | rolling | [observer-slo.md](observer-slo.md) |

## Per-service operations endpoints

| Service | /health | /state | /metrics | /slo |
| --- | --- | --- | --- | --- |
| matcher | yes | no (see /markets) | yes | yes |
| observer | yes | yes | yes | yes |

## Watchtower alert classes

| Class | Service | Severity | Channel | Source |
| --- | --- | --- | --- | --- |
| reorg-depth-exceeded | observer | warning | slack | ADR 0006 |
| missing-terminal-event | observer | critical | pagerduty | ADR 0006 |
| deadline-breach | observer | critical | pagerduty | ADR 0006 |
| snapshot-missing | observer | critical | pagerduty | bootstrap path |
| /orders-503 | matcher | critical | pagerduty | live signing flag |
| /ticker-503 | matcher | warning | slack | public market data |
| /trades-503 | matcher | warning | slack | public market data |
| /depth-503 | matcher | warning | slack | public market data |
| /markets-503 | matcher | warning | slack | public market data |

## Alert routing

The alert routing table is defined in
`src/lib/alert-router.ts`. The default table is:

* `observer:critical` → pagerduty → `phlebas-observer-critical`
* `observer:warning` → slack → `#phlebas-alerts`
* `matcher:critical` → pagerduty → `phlebas-matcher-critical`
* `matcher:warning` → slack → `#phlebas-alerts`

A custom table can be loaded from the environment at deploy time.
The default table is the canonical record for the testnet.

## Runbooks

| Runbook | Service | Use when |
| --- | --- | --- |
| [incident-response.md](../runbooks/incident-response.md) | all | any critical alert |
| [pre-deploy.md](../runbooks/pre-deploy.md) | all | any new deploy |
| [post-deploy.md](../runbooks/post-deploy.md) | all | any new deploy |
| [observer-restart.md](../runbooks/observer-restart.md) | observer | observer restart |
| [market-data-restart.md](../runbooks/market-data-restart.md) | matcher | matcher restart |

## Out of scope

The dashboard does not cover:

* the chain-side latency, which is a property of the chain
  clients;
* the Vercel deploy surface, which is owned by the frontend
  team;
* the audit surface, which is owned by the security team.
