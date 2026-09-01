# ADR 0003: Persistent Native Matcher and Solver Domain

Date: 01-09-2026
Status: Accepted for local no-value implementation
Production status: Not approved

## Context

ADR 0002 selected native transparent ZEC atomic settlement and wallet-held liquidity. The prior loopback matcher restored one mutable JSON snapshot and served a legacy `pZEC` order shape. It did not provide a single durable event sequence, authenticated control messages, solver capacity, route comparison, exact native-settlement plans, or stable public cursors.

The matcher must remain unable to spend funds. It may authenticate an order or solver authorization, but that authorization does not sign a Zcash or EVM transaction and does not grant custody.

## Decision

Version 1 uses one immutable matcher configuration and one single-writer event journal. The configuration binds the EIP-712 order domain, exact base and quote network and asset identifiers, settlement protocol, refund policy, confirmation policy, solver limits, and state limits.

Every accepted mutation follows this order:

1. Parse one strict, bounded, versioned payload.
2. Validate its endpoint kind and idempotency key.
3. Verify the signed order, solver quote, or control digest.
4. Derive the complete next matcher state without publishing it.
5. append and fsync one hash-chained journal record;
6. publish the derived state in memory;
7. atomically write a checkpoint that binds the journal head, state root, and configuration hash.

Restart replays every journal event from genesis. It verifies any checkpoint at its exact journal prefix and rewrites a valid stale checkpoint to the current head. Missing initialized files, partial records, sequence gaps, changed records, state-root mismatch, configuration drift, or an existing writer lock fails closed. Each writer lock carries a random ownership token, and shutdown refuses to remove a lock whose exact ownership bytes changed. The service never creates an empty replacement for initialized state.

## Matching and authorization

The matcher supports:

* GTC, IOC, and FOK semantics;
* deterministic price-time priority;
* integer quote arithmetic and fee caps;
* partial fills without overfill;
* signed cancellation and account-epoch invalidation;
* exact request idempotency, with conflict on request ID reuse for different bytes;
* bounded accepted-order, open-order, per-account, solver, route-fill, and journal state;
* deterministic state roots and replay.

The EIP-712 signature authorizes the order intent only. It does not authorize either asset-moving leg. A Zcash wallet and an EVM wallet must separately review and sign their exact funding, claim, or refund transactions if those later release gates pass.

## Solver liquidity

A solver quote binds its matcher domain, signer, source and recipient accounts, exact networks and assets, side, capacity, minimum fill, fixed or curve price policy, slippage, fee, nonce, expiry, and settlement protocol. Capacity remains an advertised wallet-held amount. Consumption is linearized in the same durable sequence as matching.

The router compares bounded executable order-book, solver, and combined candidates using integer all-in cost and deterministic tie-breaking. No route is selected unless its required fill amount can be represented by complete per-fill plans within the configured limits.

## Settlement output

Every selected fill maps to one immutable no-value atomic-swap plan. The plan binds:

* both signed authorization hashes;
* exact assets, networks, amounts, and accounts;
* gross quote atoms, fee basis points, fee quote atoms, and the all-in quote transfer atoms derived with exact integer rounding;
* the buyer and seller signed price limits and both signed maximum fee limits;
* one deterministic per-fill hashlock commitment request ID shared by both legs;
* an explicit `unresolved-wallet-authorization` hashlock status and no hashlock digest until the wallets authorize the exact shared commitment;
* an earlier stablecoin refund and later Zcash refund;
* configured confirmation and finality requirements;
* zero platform-retained base and quote amounts;
* no unilateral Phlebas spending authority.

The plan derives the gross quote from base atoms and execution price. A seller-side maker price rounds up and a buyer-side maker price rounds down. The fee rounds down, and the exact fee-adjusted transfer must remain between the seller's minimum and buyer's maximum signed quote bounds. The fee is rejected when it exceeds either signed maximum fee or the immutable protocol cap. Zero-value quote dust is rejected. An order salt is never reinterpreted as a hashlock digest.

The plan status is always `blocked`. It contains no transaction bytes, private key, preimage, signature request, broadcast method, funded address, contract deployment, or mainnet action. Execution remains blocked on the explicit gates in `NO_VALUE_SWAP_GATES`, including `per-fill-shared-hashlock-authorization`.

## HTTP boundary

The service binds loopback by default. Mutations require `Content-Type: application/json`, a bounded strict JSON object, and an `Idempotency-Key` header equal to the payload `requestId`.

Mutation routes are:

| Route | Event kind |
| --- | --- |
| `POST /v1/orders` | `accept-order` |
| `POST /v1/order-cancellations` | `cancel-order` |
| `POST /v1/account-epochs` | `advance-epoch` |
| `POST /v1/solver-quotes` | `accept-solver-quote` |
| `POST /v1/solver-quote-cancellations` | `cancel-solver-quote` |

The body is the exact serialized event payload. All unsigned integers wider than a JSON safe integer use canonical unsigned decimal strings. Unknown, missing, duplicate, prototype-sensitive, excessive-depth, excessive-node, and oversized input fails closed.

Read routes are:

| Route | Purpose |
| --- | --- |
| `GET /health` | Honest configured state and no-value boundary |
| `GET /v1/checkpoint` | Current journal, state, and configuration commitment |
| `GET /v1/sequence?after=N&limit=L` | Stable exclusive receipt cursor |
| `GET /v1/market/book?limit=L` | Aggregated active price levels without maker accounts |
| `GET /v1/solver-quotes?limit=L` | Active signed wallet-held quotes |
| `GET /v1/executions?after=N&limit=L` | Match results and blocked swap plans |
| `GET /v1/requests/{requestId}` | Idempotency receipt lookup |

Feed limits are from 1 to 100. Mutation request bodies default to 64 KiB, the pending admission queue defaults to 64, and the per-remote mutation rate defaults to 120 per minute. These are service protections, not economic or legal limits.

## Deployment boundary

`npm run matcher` starts loopback-only and unconfigured unless an embedding operator supplies an immutable configuration and signature verifier. Unconfigured health is available, but every matcher mutation and feed returns unavailable. This prevents an environment variable or undeployed manifest from silently selecting a live asset domain.

The authoritative journal never runs on Vercel. A separately approved private host needs a durable volume, process supervision, graceful shutdown, backups, monitoring, access control, and an exact release manifest. One host and persistence directory may have only one writer.

## Failure and recovery

An existing lock is treated as another writer or an unproven stale lock. Recovery requires stopping all candidate writers, identifying the prior process, preserving the persistence directory, validating the journal and checkpoint offline, and recording an operator decision before removing a proven stale lock. Deleting the journal, checkpoint, or initialization marker is not recovery.

The sequence evidence detects mutation, omission inside a published chain, gaps, and reordering. It does not prove that the operator included every order it received, published data on time, or matched without private information leakage.

## Current protocol anchors

The no-value policy records current facts without converting them into executable chain logic:

* The [Zcash protocol specification](https://zips.z.cash/protocol/protocol.pdf) applies BIP 16 and BIP 65 to transparent P2SH and does not support BIP 68. The candidate refund must therefore use absolute CLTV semantics, not an assumed relative CSV delay.
* [ZIP 203](https://zips.z.cash/zip-0203) defines `nExpiryHeight` as transaction expiry, not a refund trigger. A later transaction builder must bind `nLockTime`, non-final input sequence, and `nExpiryHeight` independently.
* [ZIP 300](https://zips.z.cash/zip-0300) remains Proposed. Its transparent P2SH atomic-swap construction and illustrative timeouts do not prove current standardness or wallet support.
* [NU6.3](https://z.cash/upgrade/nu6-3/) activated on 28-07-2026. The deprecated `zcashd` does not support it, so qualification must use the current Zebra and NU6.3 transaction rules.
* [Arbitrum's official chain register](https://docs.arbitrum.io/for-devs/dev-tools-and-resources/chain-info) assigns chain ID `42161` to Arbitrum One. [Nitro documentation](https://docs.arbitrum.io/how-arbitrum-works/inside-arbitrum-nitro) distinguishes soft sequencer acceptance from stronger L1 posting and confirmation.
* [Circle's registry](https://developers.circle.com/stablecoins/usdc-contract-addresses) lists native Arbitrum USDC at `0xaf88d065e77c8cC2239327C5EDb3A432268e5831`. USDC uses 6 decimal base units and is distinct from bridged `USDC.e`.
* The current [Tether supported-protocol register](https://tether.to/en/supported-protocols/) does not list Arbitrum USDt as of 01-09-2026. USDT0, a bridged token, or another representation must pass a separate exact-asset decision and cannot be inferred from the ticker.

## Remaining production gates

This decision does not approve Testnet, Mainnet, or live funds. At minimum, the following remain unresolved:

* current Zcash transparent P2SH standardness, transaction version, `nExpiryHeight`, fee, relay, replacement, and reorganization behavior;
* exact Zcash fund, claim, and refund transaction templates and wallet interoperability;
* exact EVM conditional-lock contract, audit, deployment, runtime code hash, and token behavior;
* final USDT, USDT0, or alternative quote asset selection;
* observer, coordinator, watchtower, dispute, and recovery implementation;
* production signing policy, signer rotation, and contract-wallet support;
* independent security audit, load tests, monitoring, backups, and incident drills;
* legal, compliance, jurisdiction, and operating approval;
* explicit Testnet authorization, followed later by separate Mainnet authorization.

Until those gates pass, matcher output is durable coordination evidence and blocked no-value planning only.
