# ADR 0006: Atomic Swap Observer, Coordinator, and Watchtower

Date: 01-09-2026
Status: Accepted for key-independent development
Production status: Not approved

Current Zcash boundary: references below to the ADR 0005 wallet adapter, transaction signing, or a complete offchain Zcash workflow are historical and superseded by `docs/ZCASH_TRANSACTION_LAB.md`. The legacy adapter is display-only. The candidate PCZT boundary is header-only and is not wallet-ready.

## Context

ADR 0002 defines the production target: one two-chain atomic swap per matched fill, with a transparent Zcash P2SH leg and an EVM conditional-lock leg. ADR 0003 fixes the EVM contract. ADR 0004 fixes the offchain state machine. ADR 0005 fixes the ZEC address encoder, P2SH script builder, and wallet adapter.

The current repository has the EVM contract, the in-browser matcher, the offchain state machine, and the ZEC script builder. It does not have an offchain observer that watches both chains, a persistent coordinator that records per-fill state, or a watchtower that detects stop conditions and emits alerts.

The observer, the coordinator, and the watchtower are all key-independent. They never sign a transaction and never hold a spend key. They are the only surfaces that touch both chains at the same time.

## Decision

Add three key-independent services:

- **EVM observer** watches the `ConditionalLock` contract for `Deposited`, `Claimed`, and `Refunded` events and updates the coordinator's per-fill state. The observer runs on a polling loop against an EVM JSON-RPC endpoint. The polling interval is configurable; the default is 12 seconds.
- **ZEC observer** watches a set of P2SH addresses for funding, claim, and refund transactions. The observer runs on a polling loop against a Zcash JSON-RPC endpoint. The polling interval is configurable; the default is 60 seconds. The observer can also accept direct `getrawtransaction` and `gettxout` results as input, so the production deployment can wire a real node and the test deployment can wire a deterministic mock.
- **Persistent coordinator** records the per-fill state to disk. The coordinator is the source of truth for the matcher, the wallet adapter, and the watchtower. The coordinator replays the observer's events on restart.
- **Watchtower** reads the coordinator's per-fill state and emits alerts on stop conditions: a reorg above the configured confirmation depth, an observer disagreement, a missing terminal event, a witness mismatch, and a deadline breach.

The services are HTTP servers on loopback. The matcher, the wallet adapter, and the UI call into them without holding a spend key. The services are isolated under `services/` and are not bundled into the Vercel deployment.

## EVM observer

The EVM observer calls the JSON-RPC `eth_getLogs` method against the configured RPC endpoint. It filters on the contract address and the event topic hashes. It decodes the event payload, computes the EVM hash of the fill, and pushes a transition into the coordinator.

The observer's input is:
- the RPC endpoint URL,
- the `ConditionalLock` contract address,
- the from-block cursor,
- the poll interval.

The observer's output is a stream of `AtomicSwapEvent` records that the coordinator consumes. The stream is replayable: the observer stores its cursor and re-fetches from the cursor on restart.

The observer does not sign anything. The observer does not hold a key. The observer does not broadcast anything.

## ZEC observer

The ZEC observer watches a set of P2SH addresses. The matcher publishes the addresses as it creates fills. The ZEC observer calls `getrawtransaction` and `gettxout` for each address and decodes the script pubkey, the value, and the spend.

The ZEC observer's input is:
- the Zcash RPC endpoint URL,
- the list of P2SH addresses to watch,
- the from-height cursor,
- the poll interval.

The ZEC observer's output is a stream of `ZcashOutpointEvent` records that the coordinator consumes. The stream is replayable.

The ZEC observer is a stub in this PR: the production deployment wires a real Zcash node, and the test deployment wires a deterministic mock. The coordinator does not care which one is in use.

## Persistent coordinator

The coordinator is a key-value store keyed by fill id. Each value is a per-fill state record. The coordinator consumes the observer's event streams and applies the state transitions from the offchain state machine. The coordinator is the source of truth for the matcher, the wallet adapter, and the watchtower.

The coordinator's API:
- `GET /fill/:id` — return the current state of a fill.
- `GET /fills` — return the list of fill ids and their states.
- `POST /transition` — apply a transition (used by the observer and the matcher).
- `POST /dispute` — mark a fill as disputed (used by the watchtower).

The coordinator persists its state to disk on every transition. The persistence is atomic: a crash mid-transition leaves the previous state intact. The persistence is replayable: a restart re-reads the state from disk and resumes.

The coordinator does not sign anything. The coordinator does not hold a key. The coordinator does not broadcast anything.

## Watchtower

The watchtower reads the coordinator's per-fill state and emits alerts. An alert is a structured record that names the fill, the alert class, and the recommended action. The alert classes are:

- `reorg-depth-exceeded` — the EVM chain or the ZEC chain reorganized past the configured depth.
- `observer-disagreement` — the EVM observer and the ZEC observer report inconsistent state.
- `missing-terminal-event` — the fill has not reached a terminal state and the deadline has passed.
- `witness-mismatch` — the preimage revealed on the ZEC chain does not match the EVM hash.
- `deadline-breach` — the EVM refund deadline is at or before the current time, but the leg is still funded.

The watchtower does not take any action. The watchtower emits alerts; the user, the matcher, or the wallet adapter consumes them. The watchtower does not sign anything. The watchtower does not hold a key.

## Signing boundary

The observer, the coordinator, and the watchtower are all key-independent. The signing surface is not part of this PR. The signing flag stays off.

## Why this design

The matcher is the offchain sequencer. The observer is the on-chain verifier. The coordinator is the source of truth. The watchtower is the alert layer. None of them hold a spend key. The user or the wallet adapter is the only signer.

The atomic swap's safety depends on every observer agreeing on every event. The coordinator is the single point of reconciliation. The watchtower is the single point of failure detection.

## Alternatives considered

### Single observer for both chains

A single observer that polls both the EVM chain and the ZEC chain at the same time is simpler. It is rejected because a single observer is a single point of failure. Two observers with a single coordinator is the standard pattern for cross-chain atomic swaps.

### EVM observer as an ethers.js or viem client

A full ethers.js or viem client is the standard way to read EVM events. It is rejected for this PR because the project is key-independent and does not need the signing surface that these libraries provide. The observer uses a thin `fetch`-based JSON-RPC client.

### ZEC observer as a Zcashd or Zebrad client

A full Zcashd or Zebrad client is the standard way to read ZEC events. It is rejected for the same reason. The observer uses a thin `fetch`-based JSON-RPC client.

### Watchtower takes action

The watchtower could refund on a deadline breach. It is rejected because the watchtower would have to sign a transaction, which is the exact thing ADR 0002 forbids. The watchtower emits alerts; the user, the matcher, or the wallet adapter consumes them and signs.

## Consequences

The atomic swap's offchain surface is now complete. The matcher, the observers, the coordinator, the watchtower, and the wallet adapter cover the entire workflow.

The offchain surface is key-independent. The signing surface is not part of this PR.

The production deployment wires real observers to real RPC endpoints. The test deployment wires deterministic mocks. The coordinator and the watchtower do not care which one is in use.

## Required guardrails

* The observer, the coordinator, and the watchtower never hold a key.
* The observer, the coordinator, and the watchtower never sign a transaction.
* The coordinator's persistence is atomic. A crash mid-transition leaves the previous state intact.
* The watchtower emits alerts but does not take any action.
* The observer's stream is replayable. A restart re-fetches from the cursor.

## Mainnet gate

This ADR advances to a production decision only after:

* the EVM observer is verified against a public testnet;
* the ZEC observer is verified against a public testnet;
* the coordinator is verified against a power-loss test;
* the watchtower's alert classes are verified against an adversarial test suite;
* the matcher, the observers, the coordinator, the watchtower, and the wallet adapter are exercised end-to-end on a public testnet;
* the legal and compliance review is complete;
* the explicit approval for the testnet and mainnet actions is granted.

Until then, the observer, the coordinator, and the watchtower are key-independent primitives in a local test environment.

## Revisit conditions

Revisit this decision if any of the following occurs:

* the matcher needs to send events to the coordinator (the matcher is currently a pure offchain sequencer);
* the EVM observer needs to support a chain other than Arbitrum Sepolia;
* the ZEC observer needs to support a chain other than the Zcash testnet;
* the watchtower needs to take action (e.g., refund on a deadline breach);
* the coordinator needs to support a different persistence backend.
