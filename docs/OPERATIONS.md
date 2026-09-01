# Proposed operations model

Status: custody service inventory superseded for the target product

The gateway, reserve ledger, mint controller, burn queue, and threshold payout signer below belong to ADR 0001. [ADR 0002](adr/0002-native-zec-atomic-settlement.md) replaces them with read-only chain observers, a non-signing swap coordinator, a persistent journal, and a timeout watchtower. No live operations are approved.

The only runnable operator path in this repository is the isolated loopback matcher pair. See [OPERATOR_RUNBOOK.md](OPERATOR_RUNBOOK.md). Do not set `PHLEBAS_MATCHER_URL`, `PHLEBAS_MATCHER_USDC_URL`, or `PHLEBAS_MATCHER_USDT_URL` on Vercel. The atomic-swap observer remains reference code and is not an approved operator service.

## 1. Trust-zone separation

Production operations are split into three zones with independent credentials and deployment control.

| Zone | Services | Explicit exclusions |
| --- | --- | --- |
| Public edge | Vercel UI, documentation, cached read-only market feed | Keys, deposits, withdrawals, identity records, authoritative matching |
| Arbitrum application | Matcher, sequence log, settlement submitter, indexer, reserve publisher | Native ZEC custody keys |
| Zcash custody | Zebra observers, deposit ledger, custody signer, withdrawal coordinator | Public web hosting and arbitrary internet access |

No credential crosses zones. Public compromise must not create a mint, withdrawal, governance change, or trade without a valid user signature.

## 2. Proposed service inventory

### Public interface

- Public Next.js application with static assets and stateless routes
- Content Security Policy and strict transport security
- Read-only market and reserve endpoints
- Client-side typed-data and transaction construction
- Public status and incident links

### Trading services

- Order intake validates schemas, signatures, expiry, fee caps, pair allowlists, and rate limits.
- Sequencer assigns monotonic receipt numbers before an order becomes eligible.
- Matcher applies deterministic price-time priority.
- Settlement submitter carries no authority beyond presenting signed fills to the contract.
- Indexer builds reconstructible order, fill, cancellation, AMM, and governance views.

### Zcash services

- At least three independently operated Zebra observers track chain state.
- Deposit reconciler creates single-use mint candidates from observer quorum.
- Attesters sign bounded mint claims without custody-spend authority.
- Withdrawal coordinator constructs deterministic transparent transactions.
- Custody signers authorize only policy-compliant transactions through a separate quorum.
- Reserve watcher recomputes controlled UTXOs and all customer liabilities.

Zebra RPC endpoints remain private and must not be exposed to the public internet. Production node requirements follow the [Zebra deployment guidance](https://zebra.zfnd.org/user/requirements.html).

## 3. Data stores

| Store | Required properties |
| --- | --- |
| Order receipt log | Append-only, monotonic, hash-rooted, externally checkpointed |
| Trade index | Rebuildable from Arbitrum logs and signed receipts |
| Deposit ledger | Exact outpoint identity, integer zatoshis, observer evidence, single-use status |
| Liability ledger | tZEC supply plus pending deposit refunds and unpaid burn claims |
| Withdrawal journal | Immutable state transitions and linked native transaction |
| Compliance case store | Encrypted, access-logged, retained only under approved policy |
| Governance registry | Proposed action, delay, approvers, execution, and public hash |

The customer-liability ledger is authoritative for operations but must be independently reproducible from signed events and onchain state. Backups are encrypted, tested through restore drills, and isolated from production credentials.

## 4. Observability

### Public indicators

- Confirmed controlled reserve `A`, exact claim-matched in-transit principal `T`, excluded unresolved principal `U`, and excluded unconfirmed change `C`
- tZEC supply and each pending customer-liability class
- Controlled coverage `A / (L - T + B)` and total matched coverage `(A + T) / (L + B)`, with numerator, denominator, proof timestamp, and `not applicable` when a denominator is zero
- Observer agreement and latest accepted Zcash height
- Deposit and withdrawal queue age
- Matcher receipt and settlement sequence gaps
- Contract pause state and queued governance changes
- Stablecoin contract pause, blacklist, and market-depeg warnings

The public display labels `T` as non-reusable settlement in transit and labels `U` and `C` as excluded from solvency. It never presents `A / L` as the governing coverage ratio.

### Internal alerts

Page immediately for:

- Any reserve or liability mismatch at one zatoshi or one tZEC atom
- Coverage below the policy buffer
- Observer quorum disagreement or threshold reorg
- Duplicate outpoint, mint authorization, burn claim, or payout detection
- Sequence gap, signer policy bypass, key-health failure, or unexpected admin call
- Stablecoin pause or material depeg
- Arbitrum finality or L1 data-posting failure

## 5. Fail-closed operating states

| State | New orders | Fills | AMM swaps | LP removal | Mint | Reversible redemption request | Finalized burn | Native payout |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Normal | Yes | Yes | Yes | Yes | Yes | Yes | Yes | Yes |
| Trading pause | No | No | Policy choice | Yes | No | Yes | Yes when gateway healthy | Yes when gateway healthy |
| Gateway pause | Yes for existing tZEC | Yes | Yes | Yes | No | No | No | Existing valid claims under incident policy |
| Reserve deficit | No | No | No | Yes if safe | No | No | No | Existing valid claims under recovery policy |
| Contract incident | No | No | Affected pool no | Unaffected pools yes | No | No | No | Existing valid claims only when safe |

A redemption request is reversible and leaves tZEC user-controlled until the user authorizes the final burn transaction. It cannot become a finalized burn unless the gateway can commit the exact payable and payout. If that commitment is unavailable, new burns are blocked and already finalized claims remain liabilities. Emergency powers can pause, but not unpause, seize, upgrade, change fees, or transfer reserves. Recovery and unpause require the governance quorum and delay unless a narrowly documented safety exception has been independently approved before launch.

## 6. Key management

- Mint attestation and ZEC custody use separate keys, quorums, operators, and machines.
- Governance and emergency keys are separate from deployer and operational submitter keys.
- Human-readable policy and machine-enforced transaction constraints bind every signer.
- Key ceremonies record firmware, software hashes, participants, backups, recovery tests, and destruction of transient material.
- Rotation and compromise drills occur before any public-funds launch.

The reference design starts from four-of-seven independent mint attesters and five-of-seven custody authorization. These are planning values, not deployed facts, and must be justified by a formal signer-independence review.

## 7. Change control

1. Record the proposed code, parameter, infrastructure, and policy change.
2. Link threat-model and compliance impact.
3. Reproduce tests and deterministic builds in an isolated environment.
4. Obtain independent review for the affected trust zone.
5. Publish governance changes and wait the required delay.
6. Deploy to no-value testnet, then a bounded canary if eligible.
7. Verify current bytes, runtime configuration, event behavior, and rollback controls.

Core tZEC, settlement, AMM pair, and router contracts are intended to be non-upgradeable. A new version is a new deployment and explicit user migration, not a proxy implementation change.

## 8. Incident response

### Critical severity

Reserve deficit, unauthorized mint or withdrawal, signer compromise, exploitable contract issue, duplicate payout, or active loss.

Actions: activate the narrow pause, preserve LP exit when safe, stop new mints and fills, notify signers and infrastructure providers, preserve evidence, publish a factual incident notice, and begin customer-liability reconciliation.

### High severity

Stale reserve proof, observer disagreement, serious matcher fairness failure, stablecoin pause or depeg, or prolonged withdrawal delay without confirmed loss.

Actions: stop the affected surface, retain unaffected exit paths, publish status, reconcile, and require an approved recovery decision.

### Recovery gate

No service resumes merely because a metric returns to normal. Resumption requires a known cause, contained blast radius, verified current state, completed reconciliation, signed decision record, and customer communication appropriate to the impact.

## 9. Capacity and limits

Testnet begins with synthetic assets only. A restricted-mainnet canary, if ever approved, must set per-deposit, per-withdrawal, per-wallet, per-day, total tZEC supply, pool TVL, and aggregate reserve limits below the demonstrated operating and insurance capacity.

Limits can decrease immediately under emergency policy. Increasing any public-funds limit requires a delayed governance action, updated risk evidence, and legal clearance.
