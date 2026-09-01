# Phlebas

Phlebas is a production-minded protocol design and no-value interface simulation for native transparent ZEC markets against USDC and a separately gated USDT-family asset. The active target uses one wallet-to-wallet, two-chain atomic-swap plan per fill. Historical `pZEC` gateway and AMM screens remain labeled legacy fixtures.

> Status: no-value simulation with an implemented local persistent matcher domain. The matcher sequences signed intents and wallet-held solver quotes, produces hash-chained checkpoints, and maps fills only to blocked no-value swap plans. It has no keys, balances, transaction builders, broadcasts, or chain connections. The public Vercel application still uses its in-browser simulation and never hosts the authoritative journal. It is not a live exchange and is not an offer of financial services.

## Product boundary

Native ZEC is not an ERC-20 token and cannot sit directly inside an EVM constant product pool. The active target therefore separates three systems:

1. A persistent offchain matcher sequences signed orders and wallet-held solver quotes without holding assets.
2. Each fill produces immutable terms for one transparent-Zcash conditional lock and one exact-token EVM conditional lock, with the stablecoin refund earlier than the Zcash refund.
3. Wallets would review and sign every asset-moving action. Observers and a coordinator remain separate future work and cannot spend funds.

The matcher remains an offchain availability and fairness boundary. The target is non-custodial, but it is not trustless, private, or shielded. Current swap plans are deliberately non-executable until transaction, wallet, observer, legal, and release gates pass.

## Included in this candidate

- A responsive trading terminal for `ZEC/USDC` and `ZEC/USDT`
- An original landing page with explicit system-status disclosures
- An in-browser price-time matcher (GTC, IOC, FOK) with session inventory, open orders, fills, and an append-only replay log
- A separate loopback-only persistent matcher with signed order intake, cancellation and epoch controls, wallet-held signed solver quotes, bounded book-versus-solver routing, durable replay, and stable cursor feeds
- One immutable, blocked, no-value atomic-swap plan per fill. Plans retain zero platform balances and no unilateral Phlebas spending authority.
- Canonical PRODUCT_SPEC order encoding with a SHA-256 simulation digest and a keccak EIP-712 typed-data hash
- Integer CLOB vs legacy pZEC AMM split-route comparison and LP share mint/burn previews, including IL versus hold at 4x and 1/4x. The native-settlement target uses wallet-held maker and solver liquidity.
- First-session education, country-blocked demonstration, deposit state tour, and labeled gateway incident copy
- `/legal` and `/security` simulation pages; landing and terminal footers omit a GitHub URL
- Integer seed books, empty/loading/stale/unavailable ticket gates, and a transparent-destination inspector
- Click-to-price depth, local last/spread, and slippage-bounded market orders as IOC
- Integer constant-product quotes and local add/swap previews for `ZEC/USDC` and `ZEC/USDT`
- ZIP 321 testnet TEX issuance through a local gateway, plus the PRODUCT_SPEC withdrawal state tour
- `/status` and `/api/status`, branded 404/error surfaces, and production `noindex`
- Executable withdrawal-coverage checks after a finalized burn; production mint, custody, and payout remain design-only
- Threat model, operational controls, compliance gates, and staged launch plan
- Explicit Vercel boundary for a public, non-custodial interface

- No-value Arbitrum Sepolia contracts (`contracts/`), a local matcher operator (`services/matcher`), and a local TEX gateway (`services/gateway`)

The public Vercel app still does not deploy those contracts, hold spend keys, or run the authoritative matcher.

## Design direction

The terminal takes structural cues from [Hyperliquid](https://app.hyperliquid.xyz/trade), [Lighter](https://app.lighter.xyz/), and [Nado](https://nado.finance/): dense market hierarchy, compact order entry, and approachable liquidity surfaces. It uses an original visual system, a Zcash-inspired gold accent, and unusually explicit settlement and custody labels.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/app` | Next.js application shell and global styles |
| `src/components` | Trading, liquidity, gateway, and architecture views |
| `src/lib` | Matcher, integer AMM, keccak EIP-712, TEX, session inventory, ZIP 321, fixtures |
| `contracts/` | No-value Arbitrum Sepolia sources |
| `services/` | Isolated local services. The matcher is persistent and production-shaped but no-value; gateway and observer remain legacy testnet stubs. Never on Vercel. |
| `infra/testnet` | Undeployed Sepolia manifest |
| `docs/PRODUCT_SPEC.md` | Markets, order semantics, LP scope, and user flows |
| `docs/DELIVERY_PLAN.md` | Agent Team workstreams, PR sequence, and release protocol |
| `docs/BROWSER_ACCEPTANCE.md` | Reproducible responsive, keyboard, and reduced-motion checks |
| `docs/LANDING_AND_USER_JOURNEYS.md` | Landing, trader, LP, deposit, and withdrawal experience |
| `docs/ARCHITECTURE.md` | System boundaries and proposed production topology |
| `docs/adr/0003-persistent-native-matcher.md` | Durable matcher, solver, API, and recovery decision |
| `docs/ASSET_AND_ACCOUNTING.md` | Settlement ZEC (`tZEC`), reserves, liabilities, and reconciliation |
| `docs/WALLET_COMPATIBILITY.md` | Current ZEC wallet evidence and executable Testnet qualification |
| `docs/THREAT_MODEL.md` | Abuse cases, invariants, tests, and stop conditions |
| `docs/OPERATIONS.md` | Proposed services, observability, and incident control |
| `docs/OPERATOR_RUNBOOK.md` | Loopback Compose start, health, and stop for gateway, matcher, observer |
| `docs/LICENSE_CHOICE.md` | Why Apache-2.0, and that it is not MIT |
| `docs/LEGAL_AND_COMPLIANCE.md` | Regulatory questions and jurisdiction gates |
| `docs/LAUNCH_PLAN.md` | Testnet to restricted-mainnet sequencing |
| `docs/SOURCES.md` | Primary technical and regulatory references |

## Local development

Requirements: Node.js 24.x and npm. CI verifies the same major version, which supports direct execution of the TypeScript test files used here.

```bash
npm ci --ignore-scripts
npx playwright install chromium
npm run dev
```

Open `http://localhost:3000`.

The landing page is at `/`. The trading terminal is at `/trade`, the liquidity preview is at `/liquidity`, and other shareable simulation views use routes such as `/trade?view=architecture`. `/status` and `/api/status` describe the running simulation. There is no live-funds path.

Run the full local validation:

```bash
npm run check
```

Foundry is required for `npm run test:contracts`. Local testnet services:

```bash
npm run gateway
npm run matcher
```

`npm run matcher` starts in an honest unconfigured no-value mode unless an embedding operator supplies an immutable matcher configuration and verifier. Set `PHLEBAS_GATEWAY_URL=http://127.0.0.1:8787` and `PHLEBAS_MATCHER_URL=http://127.0.0.1:8788` only on a machine that is supposed to reach those processes. Do not set them on Vercel. Isolated operation is documented in [services/README.md](services/README.md).

Arbitrum Sepolia contract deploy is documented in [contracts/README.md](contracts/README.md). `infra/testnet/arbitrum-sepolia.json` stays `"deployed": false` until a real Sepolia transaction is recorded. Wallet submit of `settle()` stays off unless `NEXT_PUBLIC_PHLEBAS_SEPOLIA_SUBMIT=1` is set locally.

Run the production browser checks after installing Chromium once:

```bash
npx playwright install chromium
npm run check:browser
```

The [browser acceptance guide](docs/BROWSER_ACCEPTANCE.md) defines the routes, viewport widths, assertions, and limits.

## Proposed production decisions

- Networks: transparent Zcash plus Arbitrum One, chain ID `42161`
- Quote assets: native Circle USDC first. USDT, USDT0, or another candidate remains unresolved until one exact issuer-supported asset passes review.
- Base asset: native transparent ZEC, never a Phlebas receipt or platform balance
- Orders: domain-separated signed intents with nonce cancellation, account epochs, expiry, fee caps, and explicit venue masks
- Matcher: single-writer price-time sequencing, hash-chained events, atomic checkpoints, deterministic replay, and bounded public feeds
- Liquidity: signed wallet-held maker and solver capacity, including fixed or bounded curve pricing. No passive LP claim is created.
- Settlement: immutable no-value two-chain plans today. Executable Zcash and EVM transaction paths remain blocked.
- Custody: none in the target matcher and settlement design. Each user or solver retains its keys and refund path.

Every decision remains provisional until implementation, independent audits, legal review, custody validation, and the launch gates pass.

## ZEC wallet compatibility

The proposed deposit flow does not invent an EVM-style ZEC wallet connector. It uses a unique TEX address, a standard ZIP 321 `zcash:` payment request, QR or copy-and-paste handoff, and independent chain observation. Withdrawals accept only a network-correct transparent destination under the proposed policy.

No wallet is Phlebas verified today. The [wallet compatibility plan](docs/WALLET_COMPATIBILITY.md) separates maintainer-documented capabilities from executed interoperability evidence and defines the Testnet suite a wallet must pass before the UI can call it compatible.

## Deployment boundary

Vercel may host the public, stateless interface, documentation, read-only public market data, and client-side transaction preparation. It must never store custody or mint keys, operate Zcash nodes, coordinate withdrawals, maintain the authoritative customer-liability ledger, or host sanctions and identity casework.

## Licensing and publication

The software in this repository is licensed under the Apache License 2.0. See `LICENSE` and [the license choice note](docs/LICENSE_CHOICE.md). That choice does not make Phlebas an exchange, a live-funds service, or an audited product.

## Read next

Start with [the product specification](docs/PRODUCT_SPEC.md), then read [the architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md), and [launch plan](docs/LAUNCH_PLAN.md).
