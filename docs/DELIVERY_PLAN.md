# Phlebas delivery plan

Status: active full-build goal, dated 31-08-2026. The public app now includes an in-browser matcher, integer seed books, integer AMM quotes, CLOB+AMM split-route comparison, LP share mint/burn, empty/stale/unavailable ticket gates, SHA-256 session digests, keccak EIP-712 typed data, optional Arbitrum Sepolia wallet connection, local testnet TEX issuance, a local matcher operator, `/status`, and branded error surfaces. Solidity sources for undeployed Sepolia contracts live in `contracts/`.

## 1. Objective

Build and verify Phlebas as a GitHub and Vercel project with:

- An original landing and onboarding experience
- A professional `ZEC/USDC` and `ZEC/USDT` trading terminal
- A deterministic order-book simulation and, later, testnet settlement contracts
- Small-scope `ZEC/USDC` and `ZEC/USDT` constant product pools
- Transparent-ZEC wallet-compatible deposit and withdrawal journeys
- Zcash testnet observers, a single-use deposit ledger, withdrawal state machine, and reserve proofs
- Security, compliance, monitoring, incident, and release controls

The current application remains a no-value simulation. Mainnet and real-funds capability are not part of any automatic deployment path.

## 2. Agent Team task contract

| Field | Contract |
| --- | --- |
| Objective | Deliver the exact product and infrastructure above through independently reviewable milestones |
| In scope | Product, frontend, simulation engines, testnet contracts and services, documentation, tests, CI, GitHub PRs, Vercel previews |
| Out of scope | Real custody, mainnet contracts, live quote assets, public deposit addresses, production keys, leverage, lending, shielded deposits |
| Risk tier | High, because later milestones touch financial and identity-bearing infrastructure design |
| Mutation authority | Local project files are authorized. GitHub and Vercel changes are limited to the named Phlebas project and exact reviewed releases |
| Done when | Every milestone passes its tests and independent review, every approved PR and preview verifies, and no blocked real-funds claim remains |
| Failure rule | A missing source, audit, legal decision, credential, wallet test, or accounting proof remains `unknown` or blocked, never converted to a pass |

## 3. Intended repository topology

The project starts as one Next.js application and adds boundaries only when a milestone needs them.

```text
phlebas/
  src/
    app/                       public web routes
    components/                product UI
    lib/                       browser-safe simulation logic
  packages/
    orderbook-domain/          order encoding, matching, fills, cancellation
    amm-domain/                integer AMM and route models
    protocol-types/            versioned cross-service schemas
  contracts/                   no-value Arbitrum testnet contracts
  services/
    matcher/                   order intake, sequencing, matching
    gateway/                   deposit and withdrawal state machines
    reserve-watcher/           independent reserve and liability calculation
  infra/
    local/                     local containers and synthetic fixtures
    testnet/                   testnet-only deployment templates
  docs/                        product, architecture, risks, operations, sources
```

The public Vercel application imports only browser-safe packages. Custody, observer, matcher, compliance, and reserve services are never bundled into or configured through the public frontend.

## 4. Pull request sequence

### Baseline: repository and release controls

Purpose: publish the reviewed simulation candidate to `main`, connect the Vercel project, enable required checks, and establish the no-mainnet boundary.

Acceptance:

- Exact tracked tree passes lint, type checking, unit tests, production build, secret scan, and independent review.
- Repository visibility, license, public description, topics, and profile impact are explicitly decided.
- GitHub authentication maps to the approved owner without exposing credentials.
- Vercel builds the same commit and serves no secrets or real-funds configuration.

### PR 1: landing and onboarding completion

Branch: `feat/landing-and-onboarding`

Baseline already present locally:

- Original landing page at `/`
- Trading terminal at `/trade`
- Protocol-status, custody, transparent-ZEC, and simulation disclosures
- Market and liquidity previews with direct, truthful calls to action
- Responsive and keyboard-accessible navigation

Remaining PR deliverables:

- Complete the tZEC education and launch-gate copy against final reviewed terminology.
- Close keyboard, focus, semantic-table, touch-target, reduced-motion, and small-screen findings.
- Add repeatable route and browser acceptance evidence for the existing surfaces.
- Preserve the no-value simulation boundary through the published preview.

Acceptance:

- 320, 390, 768, and 1440 pixel browser checks pass without page overflow.
- A first-time visitor can identify what Phlebas does, what is simulated, and what native ZEC labels mean without opening documentation.
- No comparison-site asset, copy, or layout is reproduced.

### PR 2: ZEC wallet journeys

Branch: `feat/zec-wallet-journeys`

Deliverables:

- Wallet-neutral ZIP 321 payment request and QR model for a synthetic TEX deposit intent
- Transparent address validation and explicit unsupported-wallet state
- Deposit, confirmation, review, mint, burn, withdrawal, refund, and reorg UI states
- Synthetic Zcash testnet vectors and wallet compatibility matrix

Acceptance:

- No browser extension or EVM-style ZEC wallet connection is implied.
- At least two maintained ZEC wallets complete the testnet payment-request flow in executed, recorded tests before the feature is labeled compatible.
- Destination, amount, network, memo limitations, fees, linkability, and irreversible-action warnings are visible.
- All generated addresses remain synthetic or isolated testnet values.

### PR 3: order-book engine

Branch: `feat/orderbook-engine`

Deliverables:

- Versioned EIP-712 order schema and deterministic encoding vectors
- Price-time matching engine with GTC, IOC, and FOK behavior
- Partial fills, nonce bitmap, account epoch, expiry, fee cap, and replay model
- Append-only sequence receipts and deterministic event replay
- Terminal wired to the local simulation API

Acceptance:

- Integer conservation and side-aware rounding properties pass randomized tests.
- A market order is always IOC with a signed worst price.
- Replaying the same event log produces the exact same book and balances.
- Matcher authority and censorship limitations remain visible.

### PR 4: AMM and best execution

Branch: `feat/amm-and-routing`

Deliverables:

- Integer constant product model with fixed 30 basis point fee
- LP share mint and burn simulation
- CLOB-only, AMM-only, and bounded split-route comparison
- Liquidity position, fee, slippage, and impermanent-loss previews

Acceptance:

- Conservation, minimum output, rounding, reserve, and LP-share properties pass.
- Only `ZEC/USDC` and `ZEC/USDT` are constructible.
- The router is stateless and cannot retain user value.

### PR 5: Arbitrum testnet contracts

Branch: `feat/testnet-contracts`

Deliverables:

- Test-only tZEC, settlement, cancellation, pair, factory, and stateless router contracts
- Deployment manifest for an approved Arbitrum test network
- Unit, invariant, fuzz, and role-boundary tests
- Source and bytecode verification procedure

Acceptance:

- Core contracts are non-upgradeable.
- No arbitrary mint, seizure, callback, pair creation, or fee path exists.
- Independent Solidity review has no unresolved Critical or High finding.
- Every deployed address is testnet-only and labeled with the exact source commit.

### PR 6: Zcash testnet gateway

Branch: `feat/zcash-testnet-gateway`

Deliverables:

- Private Zebra observer configuration for testnet
- Multi-observer agreement model
- Single-use outpoint and deposit-intent ledger
- Threshold attestation simulation
- Burn-to-payout withdrawal journal
- Independent reserve and liability watcher

Acceptance:

- One outpoint authorizes at most one mint.
- One burn claim produces at most one payout or refund.
- Observer disagreement, reorg, stale proof, or any one-atom mismatch stops new minting.
- No production key material or mainnet endpoint enters GitHub, Vercel, logs, or fixtures.

### PR 7: operations and hardening

Branch: `feat/operations-and-hardening`

Deliverables:

- CI and deterministic release evidence
- Security headers, dependency policy, rate and resource controls
- Status, reserve, sequence, and incident observability
- Recovery drills and testnet incident runbooks
- Final independent architecture and implementation review

Acceptance:

- Every applicable security gate passes or has an explicit blocking owner.
- Preview deployments contain no source maps, credentials, internal endpoints, or private diagnostics.
- A release cannot enable mainnet or real assets through an environment-variable change alone.

## 5. Per-PR release protocol

Every pull request follows the same sequence:

1. Freeze the intended file scope and acceptance assertions.
2. Run focused tests, the full repository check, and secret and publication scans.
3. Obtain an independent review against current bytes.
4. Record the exact branch commit, tree, test results, and residual risk.
5. Push only the reviewed branch to the Phlebas GitHub repository.
6. Open the pull request with the acceptance evidence and no unsupported claim.
7. Publish a Vercel preview for the exact PR commit.
8. Verify the preview in a browser at desktop, tablet, and phone widths, including console and error-overlay checks.
9. Recheck GitHub and Vercel commit identity before merge.
10. Merge only when the required checks and explicit human gates pass.

No force push, tag, release, mainnet deployment, contract role assignment, wallet key, or real asset is included unless it is separately named and approved.

## 6. Vercel boundary

Allowed:

- Marketing and product UI
- Synthetic or public read-only data
- Browser-safe typed-data and transaction construction
- Documentation and testnet status

Prohibited:

- Zcash node or wallet RPC
- Custody, mint, withdrawal, governance, deployer, or attester keys
- Authoritative deposit, withdrawal, or customer-liability ledger
- Identity, sanctions, Travel Rule, or investigation case data
- Authoritative matcher and surveillance state

## 7. Real-funds gate

Completing all PRs produces a testnet reference implementation, not authorization to operate a mainnet exchange. Real funds remain blocked until the legal, licensing, custody, signer-independence, accounting, audit, insurance, market-integrity, reserve-monitoring, incident, and jurisdiction requirements in the launch plan have current written evidence.

## 8. Current external decisions

Before the first GitHub or Vercel mutation, the release packet still needs:

- Repository visibility: public or private
- Software license and contribution terms
- A working GitHub session for the approved owner
- Approval of the exact baseline tree and public metadata

These decisions do not block local product and testnet development. They do block the first pushed branch, pull request, and Vercel publication.
