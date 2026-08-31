# Phlebas

Phlebas is a non-custodial exchange under development for native transparent ZEC against USDC and USDT. It combines an offchain order book with one two-chain atomic swap for each fill. Users keep control of both assets and approve every funding, claim, and refund transaction in their own wallets.

[Open the public no-value simulation](https://phlebas.vercel.app)

> Current status, 01-09-2026: Phlebas is a no-value product and protocol implementation. The public app uses synthetic markets and local browser state. No production contract, Zcash node, wallet signing path, mainnet transaction, or real asset is connected. Nothing in this repository is an offer of financial services.

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

The matcher can sequence, omit, delay, or stop orders. It cannot settle a fill, redirect funds, or sign for either party. Read-only observers report chain facts. The coordinator derives state from a replayable journal and recommends the next safe wallet action.

Native ZEC and an EVM token cannot share one Uniswap v2 contract state. Phlebas therefore uses wallet-held maker and solver inventory instead of passive cross-chain LP shares. A solver may price inventory with a constant-product curve, but its assets remain in its own wallets until a specific swap is authorized.

## What is implemented

### Trading experience

* Responsive landing page and trading terminal for `ZEC/USDC` and `ZEC/USDT`
* Dense order book, recent trades, chart, order ticket, open orders, fills, and settlement views
* In-browser price-time matcher with GTC, IOC, FOK, partial fills, cancellation, and deterministic replay
* Integer prices, sizes, quote amounts, fees, and side-aware rounding
* Click-to-price depth, worst-price market protection, and feed-state safety gates
* No-value native swap walkthrough for authorization, funding, observation, confirmation, and claim, with explicit dispute, refund, expiry, and recovery domain states
* Responsive, keyboard, reduced-motion, and browser acceptance coverage

The terminal takes structural cues from Hyperliquid, Lighter, and Nado while using an original Phlebas visual system and explicit custody and settlement labels.

### Protocol domain

* Canonical order encoding, SHA-256 digests, and keccak EIP-712 typed-data hashes
* Exact chain and asset identities, deterministic fill IDs, and one swap ID per fill
* Immutable terms binding price, amounts, fee recipient, market policy, timing policy, observer policy, and chain-specific finality policies
* Two-leg state machine with ZEC-first funding, staggered refunds, mutually exclusive claim and refund outcomes, and policy-confirmed secret release
* Content-addressed funding and spend facts separated from observer attestations
* Quorum, confirmation-depth, execution-age, staleness, and source allowlist checks
* Hash-chained event receipts, deterministic replay, snapshot roots, corruption detection, and idempotency
* Fail-closed dispute handling, unbroadcast artifact abandonment, no-evidence expiry, and same-fact attestation replacement with retained audit history
* Deterministic, adversarial, replay, state-machine, and browser tests

### Local and legacy surfaces

The repository still contains an undeployed Arbitrum Sepolia contract candidate, a loopback matcher, a local testnet TEX gateway, and historical pZEC and AMM simulations. These are development fixtures. They do not define the native-settlement target and must not run on Vercel.

The active architecture is recorded in [ADR 0002](docs/adr/0002-native-zec-atomic-settlement.md).

## User journey

1. Select `ZEC/USDC` or `ZEC/USDT` and inspect market and system status.
2. Enter a limit order or an IOC market order with a signed worst price.
3. Review the exact network, asset, amount, recipient, fee cap, expiry, and allowed settlement route.
4. Sign the order authorization in the correct wallet.
5. Inspect the matcher receipt and one settlement ticket for each fill.
6. Review and sign only the wallet action supported by the current chain evidence.
7. Finish as settled or refunded. Unsafe evidence keeps the ticket disputed and disables normal progress.

The current public app simulates this journey. Wallet signing and chain broadcast stay disabled until the exact wallet, Testnet, contract, observer, legal, and release gates pass.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/app` | Next.js routes, layouts, status surfaces, and global styles |
| `src/components` | Landing, trading, liquidity, gateway, and settlement interfaces |
| `src/lib` | Orders, matching, native swaps, replay, policies, fixtures, and browser-safe domains |
| `contracts/` | Undeployed EVM contract sources and local contract tests |
| `services/` | Loopback gateway, matcher, and observer services, never for Vercel |
| `infra/testnet` | Key-free Testnet manifests and deployment records |
| `docs/PRODUCT_SPEC.md` | Markets, order semantics, settlement, liquidity, and user journeys |
| `docs/DELIVERY_PLAN.md` | Build sequence, acceptance gates, and per-PR release protocol |
| `docs/ARCHITECTURE.md` | Current boundaries and target system topology |
| `docs/THREAT_MODEL.md` | Native settlement threats, controls, tests, and stop conditions |
| `docs/WALLET_COMPATIBILITY.md` | Wallet evidence requirements and Testnet qualification |
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
npm run gateway
npm run matcher
npm run observer
```

Set these only on a machine that should reach the loopback processes:

```text
PHLEBAS_GATEWAY_URL=http://127.0.0.1:8787
PHLEBAS_MATCHER_URL=http://127.0.0.1:8788
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
