# Audit open items

This file summarizes required checklist rows that are not yet `done`.
The canonical status remains `docs/audit/audit-checklist.md`.

| ID | Item | Blocker |
| --- | --- | --- |
| contracts-10 | Exact reviewed testnet deployment and verified manifest | separately approved RPC and deploy authority |
| contracts-11 | Independent contract and protocol security review | exact release artifact not frozen |
| services-9 | Strict Zcash spend, branch, witness, destination, and finality evidence | strict adapter integration and review |
| services-10 | Strict EVM chain, contract, ABI, receipt, and finality evidence | exact deployment and authoritative journal adapter |
| services-11 | Canonical signed matcher terms consumed by both legs | matcher integration and cross-leg verification |
| services-12 | Durable authoritative settlement journals | production storage and reorganization evidence |
| operations-7 | Production alert destination | approved routing configuration |
| operations-8 | Production metrics destination | approved metrics configuration |
| operations-9 | End-to-end testnet claim, refund, failure, and recovery evidence | exact deployment and compatible wallets |
| docs-6 | Exact release evidence pack publication | exact release process |
| docs-7 | Exact-commit Vercel preview and browser evidence | candidate artifact and deployment quota |
| keys-2 | Production deployment-key separation | production key-control design |
| keys-5 | Production wallet signing documentation | production wallet design |
| keys-6 | Independent signing and broadcast-path review | exact deployment and wallet artifact |
| compliance-1 | Legal approval of exchange model and jurisdictions | counsel review |
| compliance-2 | Approved access, disclosure, privacy, sanctions, and incident controls | legal decision and implementation evidence |

Completed service rate-limiting and undeployed-manifest controls remain
recorded in the canonical checklist. Closing one row cannot implicitly
close another row.
