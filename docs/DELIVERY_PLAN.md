# Phlebas Delivery Plan

Status: active full-build goal
Updated: 31-08-2026

The public app now includes an in-browser matcher, integer seed books, legacy AMM previews, split-route comparison, LP share previews, feed-state ticket gates, SHA-256 session digests, keccak EIP-712 typed data, an optional Arbitrum Sepolia wallet connection, local testnet TEX issuance, a local matcher operator, `/status`, and branded error surfaces. The in-repository Sepolia contracts remain undeployed and belong to the legacy pZEC testnet slice, not the native-settlement target.

## Objective

Build Phlebas into a non-custodial exchange for native transparent ZEC against native USDC and native USDT. Settlement pairs are `ZEC-USDC` and `ZEC-USDT`. USDT0 is abandoned. The product needs a professional order-book interface, wallet-held maker and solver liquidity, two-chain atomic settlement, complete wallet journeys, persistent services, security controls, tests, and operations.

The current Vercel site remains a no-value simulation. Development continues through every key-independent milestone. A missing key blocks only the exact signing, broadcast, or deployment action that needs it.

## Product invariant

Phlebas never receives unilateral spending authority over a user's ZEC or stablecoin.

The active design follows [ADR 0002](adr/0002-native-zec-atomic-settlement.md):

* native ZEC remains on Zcash;
* USDC or the selected USDT asset remains on its approved EVM chain;
* each matched fill creates one pair of user-authorized conditional locks;
* wallets control funding, claim, and refund transactions;
* observers and the coordinator are read-only with respect to funds;
* the matcher sequences orders but cannot settle or redirect assets;
* maker and solver inventory stays in its owner's wallets until one swap is authorized.

Custody-backed `pZEC`, platform balances, reserve wallets, minting, burns, and operator payouts are outside the target architecture. They remain only in historical simulation code until that code is migrated or removed.

Native ZEC and an EVM token do not share one contract state. Passive Uniswap v2 LP shares are therefore outside version 1. Curve-priced solver liquidity replaces the old pZEC pool target.

## Agent Team task contract

| Field | Contract |
| --- | --- |
| Objective | Deliver the target through small, independently reviewed milestones |
| In scope | Product, frontend, protocol domains, matcher, observers, coordinator, local contracts, wallet adapters, Testnet work, security, operations, CI, GitHub PRs, and Vercel previews |
| Excluded until a named gate passes | Mainnet transactions, real assets, production keys, blind signatures, custody, leverage, lending, and shielded atomic swaps |
| Risk | High, because later milestones prepare financial transaction paths |
| Mutation authority | Local project files are authorized. GitHub and Vercel changes stay limited to Phlebas and exact reviewed releases |
| Failure rule | Missing protocol, wallet, audit, legal, identity, or recovery evidence remains unresolved. It never becomes a pass because one key is absent |

## Repository topology

The repository adds boundaries when code needs them:

```text
phlebas/
  src/
    app/                         public web routes
    components/                  product UI
    lib/                         browser-safe domains and simulation
  packages/
    protocol-types/              versioned order, fill, swap, and observer schemas
    orderbook-domain/            signed orders, matching, receipts, and cancellation
    native-swap-domain/          two-chain state machine and replay
    solver-liquidity-domain/     wallet-held quotes and curve pricing
    zcash-transactions/          transparent scripts and unsigned artifacts
  contracts/
    evm/                         local and Testnet stablecoin conditional locks
  services/
    matcher/                     order intake, sequence, match, and receipts
    zcash-observer/              read-only native-chain evidence
    evm-observer/                read-only stablecoin-chain evidence
    swap-coordinator/            persistent state, action policy, and recovery
    watchtower/                  timeout, refund, and incident alerts
  infra/
    local/                       deterministic local chains and fixtures
    testnet/                     key-free manifests and deployment procedures
  docs/                          product, architecture, risks, operations, and sources
```

The public application imports only browser-safe packages. It cannot import node credentials, service journals, signer code, or deployment secrets.

## Pull request sequence

### PR 19: native settlement foundation

This PR contains at least eight meaningful commits. Each commit has one reviewable purpose.

Deliverables:

* superseding non-custodial architecture decision;
* explicit Zcash and EVM chain and asset identities;
* browser-safe Ethereum Keccak implementation;
* versioned EIP-712 order schema and fixed vectors;
* exact order-policy validation;
* nonce bitmap and account-epoch cancellation model;
* deterministic settlement receipts and replay invariants;
* adversarial and property tests;
* updated product and delivery boundaries.

Acceptance:

* every amount and identifier has an explicit integer or byte representation;
* an order binds its chain, asset, recipient, expiry, fee limit, nonce, epoch, and venue;
* cancellation and replay rules fail closed;
* deterministic vectors are independently reproduced;
* no code connects a wallet, node, contract, key, or real asset;
* lint, type checking, tests, secret scan, build, and browser checks pass;
* an independent reviewer finds no unresolved P0, P1, or P2 issue;
* the exact PR commit has a working Vercel preview before merge.

### PR 20: native swap state machine and UI journey

Deliverables:

* immutable fill-to-swap terms and digest;
* Zcash and EVM leg states;
* funding order and staggered refund deadlines;
* claim, refund, replacement, and reorganization transitions;
* deterministic replay;
* a no-value lock, claim, and refund journey in the trading UI;
* removal of active pZEC deposit, withdrawal, mint, burn, and platform-balance language.

Acceptance:

* one fill creates one swap identifier;
* duplicate or conflicting evidence fails closed;
* claim and refund are mutually exclusive;
* every incomplete swap retains a wallet-controlled refund path;
* stale or disagreeing observations move the workflow to a disputed state;
* browser tests cover every user action and unsafe state.

### PR 21: Zcash transparent transaction lab

Deliverables:

* deterministic P2SH fund, claim, and refund script builders;
* unsigned transparent transaction artifacts;
* chain-specific lock-time and fee policy;
* local script execution vectors;
* reorganization, expiry, replacement, and restart tests;
* a wallet adapter interface that never handles secret key bytes.

Acceptance:

* vectors match the current Zcash protocol and selected implementation;
* claim requires the exact preimage and recipient signature;
* refund requires its deadline and funder signature;
* malformed, wrong-network, or nonstandard scripts fail closed;
* no key, address, RPC endpoint, broadcast, or live transaction enters the repository.

### PR 22: EVM stablecoin conditional locks

Deliverables:

* non-upgradeable local contracts for exact-token locks, claim, and refund;
* USDC-first configuration; native USDT listed in product copy, USDT0 abandoned, exact USDT contract disabled until approved;
* SafeERC20 handling and reentrancy protection;
* deterministic deployment manifest schema;
* unit, fuzz, invariant, role, and token-behavior tests;
* source and bytecode verification procedure.

Acceptance:

* arbitrary tokens, recipients, callbacks, fees, and admin seizure paths are impossible;
* claim and refund are mutually exclusive;
* deadlines and hashes match the native-swap domain;
* an independent Solidity review has no unresolved Critical or High issue;
* only local chains run until Testnet receives separate approval.

### PR 23: observers and coordinator

Deliverables:

* read-only Zcash and EVM observer interfaces;
* multi-observer agreement and staleness policy;
* persistent append-only swap journal;
* deterministic recovery after process restart;
* timeout watchtower and action policy;
* read-only public status projection.

Acceptance:

* the services have no signing capability;
* wrong-chain, wrong-contract, stale, conflicting, or reorganized evidence fails closed;
* journal replay produces the exact state and recommended wallet action;
* duplicate transactions and swap identifiers are rejected;
* recovery drills preserve every refund path.

### PR 24: wallet adapters and approved Testnet execution

Deliverables:

* Zcash wallet adapter for reviewable transaction artifacts;
* EVM wallet connection for the approved Testnet only;
* clear-signing displays for every amount, asset, recipient, deadline, fee, and privacy effect;
* executed funding, claim, timeout refund, restart, and reorganization tests;
* wallet compatibility matrix backed by recorded evidence.

Acceptance:

* Phlebas never receives a seed, private key, spending key, viewing key, or blind signature;
* the user can reject any changed term before signing;
* compatibility labels appear only after the exact wallet and version pass;
* Testnet actions have separate explicit approval.

### PR 25: persistent matcher and public market data

Deliverables:

* authenticated signed-order intake;
* monotonic sequencing and append-only receipts;
* price-time matching and cancellation service;
* externally checkable sequence checkpoints;
* rate, size, expiry, and abuse controls;
* read-only market and order-book feeds for the UI.

Acceptance:

* the matcher cannot create balances or settlement evidence;
* a market order is IOC with a signed worst price;
* replay yields the same fills and swap plans;
* omission and sequence gaps are visible;
* resource exhaustion tests pass.

### PR 26: solver liquidity

Deliverables:

* signed solver quotes from wallet-held ZEC and stablecoin inventory;
* constant-product and inventory-skew pricing strategies;
* quote expiry, capacity, fee, and slippage bounds;
* best-execution comparison across book and solver routes;
* maker dashboard for inventory and active swap risk.

Acceptance:

* Phlebas cannot retain solver or user value;
* a quote binds exact assets, networks, amounts, recipients, expiry, and fee;
* each accepted quote settles through one atomic swap;
* the UI never labels solver liquidity as Uniswap v2 or passive LP shares.

### PR 27: operations and production hardening

Deliverables:

* service health and swap-state observability;
* deterministic release evidence and exact commit identity;
* security headers, dependency policy, secret scans, and build-output scans;
* source-map and internal-endpoint controls;
* incident, timeout, reorganization, and recovery drills;
* final architecture, contract, wallet, legal, and operations reviews.

Acceptance:

* every applicable release gate passes or has a named blocking owner;
* no environment variable can enable mainnet or real assets by itself;
* production cannot start without an exact approved manifest and contract identities;
* preview and production deployments contain no credential or private diagnostic.

## Per-PR release protocol

Every PR follows this order:

1. Freeze the file scope and acceptance assertions.
2. Run focused tests, full checks, secret scans, and publication scans.
3. Obtain an independent review against the exact bytes.
4. Record commit, tree, tests, and residual risk.
5. Push only the reviewed branch to the private Phlebas repository.
6. Open or update the PR with exact evidence.
7. Verify the Vercel preview for the same commit in desktop, tablet, and phone views.
8. Recheck GitHub checks, reviews, mergeability, and deployment identity.
9. Merge only when the gates pass.
10. Verify that production serves the merge commit and rerun the affected user journeys.

No force push, tag, release, key creation, wallet funding, chain transaction, or contract role assignment is implied by this protocol.

## Key skip rule

When a step needs a key that is unavailable:

1. record the exact key purpose and boundary;
2. build and test the unsigned input and expected output;
3. add a deterministic adapter or deployment manifest;
4. verify every key-independent invariant;
5. leave the signing, broadcast, or deployment action blocked;
6. continue with the next independent milestone.

Code must not insert a placeholder secret, private endpoint, or real address to bypass the gate.

## Deployment boundary

Vercel may host:

* the public UI;
* static documentation;
* read-only public market and status data;
* browser-side preparation of unsigned orders and swap terms.

Vercel must not host:

* wallet keys or signing services;
* private node credentials;
* the authoritative matcher journal;
* the authoritative swap coordinator database;
* an observer that exposes private infrastructure;
* a service that can claim, refund, redirect, or custody funds.

## Completion condition

Phlebas becomes a live working exchange only after the full product, both chain paths, wallet integrations, contracts, persistent services, monitoring, recovery, audits, and legal gates pass on current evidence. A polished UI, green build, deployed preview, or missing key does not prove that result by itself.
