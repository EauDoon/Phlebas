# Phlebas

Phlebas is a non-custodial exchange under development for native transparent ZEC against USDC and USDT. It combines an offchain order book with one two-chain atomic swap for each fill. Users keep control of both assets and approve every funding, claim, and refund transaction in their own wallets.

[Open the public no-value simulation](https://phlebas.vercel.app)

[Open the private GitHub repository](https://github.com/EauDoon/Phlebas)

> Current status, 01-09-2026: Phlebas is a no-value product and protocol implementation. The public app uses synthetic markets and local browser state. No production contract, Zcash node, Zcash-wallet signing path, mainnet transaction, or real asset is connected. Nothing in this repository is an offer of financial services.

The current integration target is a signed USDC buy-side order submitted to an accepting no-value matcher. The matcher can validate, sequence, and record the order, but it cannot move funds. ZEC sell-side submission remains disabled until a Zcash-wallet authorization format is integrated. The contract manifest is undeployed, and every live-value action remains disabled pending its required gates.

## Markets

The target markets are:

* `ZEC/USDC`
* `ZEC/USDT`

`ZEC` means native transparent ZEC on Zcash. It is not wrapped, minted, or represented as a Phlebas platform balance. Each quote market must name one exact EVM chain and one approved stablecoin contract. USDC is the first quote candidate. USDT remains disabled until an exact asset, contract, issuer model, and jurisdiction policy pass review.

Version 1 is transparent. It does not provide shielded settlement or transaction privacy.

## How settlement works

One matched fill produces one immutable swap plan:

1. Both parties authorize the exact fill terms, assets, amounts, recipients, chain identities, fees, hashlock, and deadlines.
2. The ZEC seller funds a native Zcash conditional lock with the longer refund deadline.
3. Policy-qualified observers confirm the exact Zcash outpoint.
4. The stablecoin seller funds an exact-token EVM conditional lock with the shorter refund deadline.
5. The ZEC seller claims the stablecoin and reveals the preimage.
6. After the EVM claim reaches the signed finality policy, the stablecoin seller uses that preimage to claim ZEC.
7. If the swap stops, each funder retains a wallet-controlled refund path after the applicable deadline.

The matcher can sequence, omit, delay, or stop orders. It cannot settle a fill, redirect funds, or sign for either party. The target coordinator derives state only from verified evidence committed to a replayable journal. The older Fill observer service is an untrusted no-value diagnostic and cannot authorize wallet actions; replacing it with the journal-backed adapter remains a release gate.

Native ZEC and an EVM token cannot share one Uniswap v2 contract state. Phlebas therefore uses wallet-held maker and solver inventory instead of passive cross-chain LP shares. A solver may price inventory with a constant-product curve, but its assets remain in its own wallets until a specific swap is authorized.

## What is implemented

### Trading experience

* Responsive landing page and trading terminal for `ZEC/USDC` and `ZEC/USDT`
* Dense order book, recent trades, chart, order ticket, open orders, fills, and settlement views
* In-browser price-time matcher with GTC, IOC, FOK, partial fills, cancellation, and deterministic replay
* Loopback-only persistent matcher with authenticated order and solver intents, one hash-chained single-writer journal, deterministic recovery, stable feed cursors, and blocked no-value swap plans
* Integer prices, sizes, quote amounts, fees, and side-aware rounding
* Click-to-price depth, worst-price market protection, and feed-state safety gates
* No-value native swap walkthrough for authorization, funding, observation, confirmation, and claim, with explicit dispute, refund, expiry, and recovery domain states
* Responsive, keyboard, reduced-motion, and browser acceptance coverage

The terminal takes structural cues from Hyperliquid, Lighter, and Nado while using an original Phlebas visual system and explicit custody and settlement labels.

### Protocol domain

* Canonical order encoding, SHA-256 digests, and keccak EIP-712 typed-data hashes
* Exact chain and asset identities, deterministic fill IDs, and one swap ID per fill
* Immutable terms binding price, amounts, a zero-fee invariant, fee recipient, market policy, timing policy, observer policy, and chain-specific finality policies
* Two-leg state machine with timestamped authorizations, artifact preparation, ZEC-first funding, causal chain-time checks, staggered refunds, mutually exclusive claim and refund outcomes, and policy-confirmed secret release
* Content-addressed funding and spend facts separated from observer attestations
* Quorum, confirmation-depth, execution-age, staleness, and source allowlist checks
* One canonical observer tip per quorum, with same-height hash disagreement forced into dispute
* Hash-chained event receipts, deterministic replay, snapshot roots, corruption detection, and idempotency
* Fail-closed dispute handling, unbroadcast artifact abandonment, no-evidence expiry, and same-fact attestation replacement with leg, evidence-kind, fact, and observer provenance retained
* Deterministic, adversarial, replay, state-machine, and browser tests

The native-swap reference engine accepts only a zero protocol fee. The fee fields remain signed for schema stability, but any positive amount fails closed until the EVM escrow can prove an exact recipient split without weakening principal settlement.

### Local and legacy surfaces

The repository still contains an undeployed Arbitrum Sepolia contract candidate, a persistent loopback matcher, atomic-swap observer reference code, and historical pZEC and AMM simulations. No local TEX issuance or custody gateway is part of the current runtime. The matcher starts unconfigured, holds no keys, constructs no transactions, and cannot sign, broadcast, or move funds. None of these local services may run on Vercel.

The active settlement architecture is recorded in [ADR 0002](docs/adr/0002-native-zec-atomic-settlement.md). The persistent no-value matcher boundary is recorded in [ADR 0003](docs/adr/0003-persistent-native-matcher.md).

## User journey

1. Select `ZEC/USDC` or `ZEC/USDT` and inspect market and system status.
2. Enter a limit order or an IOC market order with a signed worst price.
3. Review the exact network, asset, amount, recipient, fee cap, expiry, and allowed settlement route.
4. Sign the order authorization in the correct wallet.
5. Inspect the matcher receipt and one settlement ticket for each fill.
6. Review and sign only the wallet action supported by the current chain evidence.
7. Finish as settled or refunded. Unsafe evidence keeps the ticket disputed and disables normal progress.

The current public app simulates this journey. Asset-moving wallet signing and chain broadcast stay disabled until the exact wallet, Testnet, contract, observer, legal, and release gates pass.

## Matcher user controls

`cancel-order` and `advance-epoch` are user-owned EIP-712 typed controls in the distinct `Phlebas Matcher Control` domain. They do not reuse the order-intent authorization.

A cancellation is verified against the accepted order's authorized signer, account epoch, and nonce. An epoch advance is verified for its account signer and invalidates that account's open orders. Neither control signs, constructs, broadcasts, or moves an asset transaction.

Every matcher mutation requires JSON, an `Idempotency-Key` equal to the payload `requestId`, and the exact active `x-phlebas-matcher-configuration` value. A successful response separates the historical `receiptCheckpoint` that accepted the command from the current `checkpoint`. An exact idempotent replay remains verifiable if later matcher activity advanced the current head. Equal-sequence checkpoints must have the same record hash and state root.

New control ingress is marker-free and always becomes `eip712-v1` inside the matcher. The journal writes that scheme explicitly. A one-time system event commits the legacy authorization cutoff to the hash chain. Old unmarked raw controls can replay only before that exact record. Restoring the old initialization marker cannot move the cutoff. Fresh initialization uses a configuration-bound transitional marker and resumes only exact canonical crash states. The system cutover has reserved journal capacity and does not reduce the configured user record or byte limits.

The browser control workflow is implemented and fails closed. Cancellation review requires an immutable confirmed native buy artifact with an `open` or `partially-filled` receipt, plus fresh matcher health, account, wallet, and checkpoint state. Epoch review requires an immutable confirmed native buy artifact, then derives the next epoch as the fresh account epoch plus one.

Confirmation repeats the matcher, account, checkpoint, and wallet checks, stops on drift, and requests only the reviewed EIP-712 typed-control signature. A known 4xx response is `rejected`; a network failure, 5xx response, unreadable or malformed response, or receipt mismatch is `receipt-unknown`. Retry revalidates the approved matcher identity and reposts exactly the original frozen body and idempotency key without signing again. These artifacts are session-only. After reload, the retry artifact is unavailable, and account-scoped open-order recovery is not implemented.

The tracked native matcher deployment manifest remains disabled and no-value. These controls do not activate a production matcher or enable a wallet, contract, chain, or asset-moving path.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/app` | Next.js routes, layouts, status surfaces, and global styles |
| `src/components` | Landing, trading, liquidity, historical state-tour, and settlement interfaces |
| `src/lib` | Orders, matching, native swaps, replay, policies, fixtures, and browser-safe domains |
| `contracts/` | Undeployed EVM contract sources and local contract tests |
| `services/` | Loopback matcher and read-only atomic-swap observer reference, never for Vercel |
| `infra/testnet` | Key-free Testnet manifests and deployment records |
| `docs/PRODUCT_SPEC.md` | Markets, order semantics, settlement, liquidity, and user journeys |
| `docs/DELIVERY_PLAN.md` | Build sequence, acceptance gates, and per-PR release protocol |
| `docs/ARCHITECTURE.md` | Current boundaries and target system topology |
| `docs/THREAT_MODEL.md` | Native settlement threats, controls, tests, and stop conditions |
| `docs/WALLET_COMPATIBILITY.md` | Wallet evidence requirements and Testnet qualification |
| `docs/ZCASH_TRANSACTION_LAB.md` | Exact transparent HTLC, unsigned artifact, fee, expiry, and wallet-review boundaries |
| `docs/adr/0003-persistent-native-matcher.md` | Persistent matcher, recovery, HTTP, and no-value settlement boundaries |
| `docs/OPERATIONS.md` | Service, observability, recovery, and incident requirements |
| `docs/BROWSER_ACCEPTANCE.md` | Reproducible interface and responsive checks |
| `docs/SOURCES.md` | Primary protocol, contract, wallet, and regulatory references |

## Run locally

Requirements:

* Node.js 24.x
* npm
* Chromium for browser tests
* Foundry for contract tests

Install and start the app:

```bash
npm ci --ignore-scripts
npx playwright install chromium
npm run dev
```

Open `http://localhost:3000`. The main routes are:

| Route | Purpose |
| --- | --- |
| `/` | Landing page |
| `/trade` | Trading terminal and native settlement walkthrough |
| `/liquidity` | No-value liquidity interface |
| `/status` | Public simulation status |
| `/api/status` | Machine-readable simulation status |

## Validate the repository

Run the code, protocol, contract, secret, and production-build gates:

```bash
npm run check
```

Run the same gates plus Playwright browser coverage:

```bash
npm run check:browser
```

Useful focused commands:

```bash
npm run lint
npm run typecheck
npm run test
npm run test:contracts
npm run scan:secrets
npm run build
npm run test:browser
```

The [browser acceptance guide](docs/BROWSER_ACCEPTANCE.md) defines the required routes, viewports, interactions, and safety assertions.

## Optional loopback services

The local development services are isolated from the public app:

```bash
npm run matcher
```

Set these only on a machine that should reach the loopback processes:

```text
PHLEBAS_MATCHER_USDC_URL=http://127.0.0.1:8788
PHLEBAS_MATCHER_USDT_URL=http://127.0.0.1:8789
```

Do not set those variables on Vercel. See [services/README.md](services/README.md) for the isolated Compose workflow.

The Arbitrum Sepolia deployment procedure is documented in [contracts/README.md](contracts/README.md). `infra/testnet/arbitrum-sepolia.json` must remain `"deployed": false` until a real deployment is authorized, executed, and recorded. Local wallet submission remains disabled unless `NEXT_PUBLIC_PHLEBAS_SEPOLIA_SUBMIT=1` is set for an approved Testnet run.

## Wallet boundary

Phlebas may prepare an unsigned, reviewable transaction artifact. It must never request, receive, store, or log:

* a seed phrase;
* a Zcash spending key or viewing key;
* an EVM private key;
* a wallet database;
* a blind signature;
* an unrestricted token approval.

No Zcash wallet is Phlebas verified today. Compatibility requires executed Testnet evidence for the exact transparent fund, claim, timeout refund, fee, restart, and reorganization paths. ZIP 321 and TEX payment support alone does not prove atomic-swap compatibility.

## Deployment and release boundary

Vercel may host the public interface, static documentation, read-only public market and status data, and browser-side preparation of unsigned terms. It must never host private node credentials, wallet keys, an authoritative matcher or swap journal, or any service that can sign, claim, refund, redirect, or custody funds.

Every pull request must pass focused tests, the full repository check, secret scanning, independent review, GitHub checks, and an exact-commit Vercel preview. Production deployment follows only after the applicable release gates pass.

Testnet execution still requires exact Zcash transaction construction, reviewed EVM escrow code, current chain policies, observer recovery drills, wallet compatibility evidence, legal review, and explicit authorization. Mainnet also requires successful Testnet operation, independent audits, reproducible services and contracts, production identities, monitoring, incident drills, exact deployment manifests, and separate authorization for real assets.

## Read next

Start with the [product specification](docs/PRODUCT_SPEC.md), [architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md), and [delivery plan](docs/DELIVERY_PLAN.md).

## License

Phlebas is licensed under the Apache License 2.0. See [LICENSE](LICENSE) and [the license choice](docs/LICENSE_CHOICE.md).
