# Audit open items

This file tracks the audit items that are not yet `done` and
the blockers that prevent them from being closed. The file is
the input to the audit prep runbook.

## Open items

| ID | Item | Owner | Blocker |
| --- | --- | --- | --- |
| contracts-1 | ConditionalLock contract is deployed to Arbitrum Sepolia with the verified deployment manifest | contracts | needs Sepolia RPC + deploy key |
| contracts-2 | ConditionalLock contract is verified on the block explorer | contracts | depends on contracts-1 |
| operations-7 | PagerDuty / Slack integration is wired to the alert router | operations | needs routing table override |
| operations-8 | Prometheus remote-write adapter is wired to the metrics counter | operations | needs scrape config |
| docs-6 | Release readiness evidence pack is published on every release | docs | depends on release process |
| keys-2 | Project deploy key has no production keys | security | needs production key |
| keys-5 | Wallet adapter signing surface is documented for the production deploy | security | depends on production design |

## Closed items

`services-7` and `services-8` are closed. All completed items are tracked
in `docs/audit/audit-checklist.md`.
