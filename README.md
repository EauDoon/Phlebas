# Phlebas

Phlebas is being developed as a non-custodial exchange for native transparent ZEC against USDC and USDT. The current application is a no-value interface and matching simulation. The target settlement path uses one two-chain atomic swap for each fill, with users signing every asset-moving transaction in their own wallet boundary.

> Status: no-value simulation with optional local testnet services. Contracts are in-repo and undeployed. The public matcher is in-browser. A local operator, testnet TEX gateway, and Arbitrum Sepolia wallet connector exist and do not move mainnet funds. It is not an exchange and is not an offer of financial services.

## Product boundary

Native ZEC is not an ERC-20 token and cannot sit directly inside an EVM constant-product pool. The target design separates three systems:

1. An offchain matcher sequences signed orders and creates immutable settlement terms for each fill.
2. Native transparent ZEC and the selected EVM stablecoin enter separate user-authorized conditional locks that share one hash and use staggered refund deadlines.
3. Read-only observers and a persistent coordinator report funding, claim, refund, and reorganization state without controlling either asset.

The matcher can omit or delay orders, so the design is non-custodial but not trustless. Version 1 uses transparent ZEC. It does not provide shielded settlement. Native ZEC and an EVM token cannot form a standard Uniswap v2 pool in one contract, so wallet-held solver liquidity replaces passive LP shares in the target product.

## Included in this candidate

- A responsive trading terminal for `ZEC/USDC` and `ZEC/USDT`
- An original landing page with explicit system-status disclosures
- An in-browser price-time matcher (GTC, IOC, FOK) with session inventory, open orders, fills, and an append-only replay log
- Canonical PRODUCT_SPEC order encoding with a SHA-256 simulation digest and a keccak EIP-712 typed-data hash
- Integer CLOB vs legacy pZEC AMM split-route comparison and LP share mint/burn previews, retained while the UI migrates to solver liquidity
- Integer seed books, empty/loading/stale/unavailable ticket gates, and a transparent-destination inspector
- Click-to-price depth, local last/spread, and slippage-bounded market orders as IOC
- Integer constant-product quotes and local add/swap previews for the superseded pZEC simulation
- ZIP 321 testnet TEX issuance through a local gateway and a custody-state tour that remain legacy simulation surfaces
- `/status` and `/api/status`, branded 404/error surfaces, and production `noindex`
- Executable withdrawal-coverage checks after a finalized burn; production mint, custody, and payout remain design-only
- Threat model, operational controls, compliance gates, and staged launch plan
- Explicit Vercel boundary for a public, non-custodial interface

- No-value Arbitrum Sepolia contracts (`contracts/`), a local matcher operator (`services/matcher`), and a local TEX gateway (`services/gateway`)

The public Vercel app still does not deploy those contracts, hold spend keys, or run the authoritative matcher.
Native atomic-swap terms, wallet handoff, live testnet integrations, the production matcher, Zcash transaction construction, EVM contracts, observers, and the coordinator remain acceptance targets. The superseding architecture is recorded in [ADR 0002](docs/adr/0002-native-zec-atomic-settlement.md).

## Design direction

The terminal takes structural cues from [Hyperliquid](https://app.hyperliquid.xyz/trade), [Lighter](https://app.lighter.xyz/), and [Nado](https://nado.finance/): dense market hierarchy, compact order entry, and approachable liquidity surfaces. It uses an original visual system, a Zcash-inspired gold accent, and unusually explicit settlement and custody labels.

## Repository map

| Path | Purpose |
| --- | --- |
| `src/app` | Next.js application shell and global styles |
| `src/components` | Trading, liquidity, gateway, and architecture views |
| `src/lib` | Matcher, integer AMM, keccak EIP-712, TEX, session inventory, ZIP 321, fixtures |
| `contracts/` | No-value Arbitrum Sepolia sources |
| `services/` | Isolated local Compose: gateway, matcher, observer stubs. Never on Vercel. |
| `infra/testnet` | Undeployed Sepolia manifest |
| `docs/PRODUCT_SPEC.md` | Markets, order semantics, LP scope, and user flows |
| `docs/DELIVERY_PLAN.md` | Agent Team workstreams, PR sequence, and release protocol |
| `docs/BROWSER_ACCEPTANCE.md` | Reproducible responsive, keyboard, and reduced-motion checks |
| `docs/LANDING_AND_USER_JOURNEYS.md` | Landing, trader, LP, deposit, and withdrawal experience |
| `docs/ARCHITECTURE.md` | System boundaries and proposed production topology |
| `docs/ASSET_AND_ACCOUNTING.md` | Superseded pZEC accounting and the migration target for per-swap accounting |
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

Set `PHLEBAS_GATEWAY_URL=http://127.0.0.1:8787` and `PHLEBAS_MATCHER_URL=http://127.0.0.1:8788` only on a machine that is supposed to reach those processes. Do not set them on Vercel. Isolated Compose is documented in [services/README.md](services/README.md).

Arbitrum Sepolia contract deploy is documented in [contracts/README.md](contracts/README.md). `infra/testnet/arbitrum-sepolia.json` stays `"deployed": false` until a real Sepolia transaction is recorded. Wallet submit of `settle()` stays off unless `NEXT_PUBLIC_PHLEBAS_SEPOLIA_SUBMIT=1` is set locally.

Run the production browser checks after installing Chromium once:

```bash
npx playwright install chromium
npm run check:browser
```

The [browser acceptance guide](docs/BROWSER_ACCEPTANCE.md) defines the routes, viewport widths, assertions, and limits.

## Target production decisions

- Networks: the current Zcash transparent pool and one approved EVM network, with Arbitrum as the test candidate
- Quote assets: native Circle USDC first; USDT or USDT0 remains unresolved until one exact asset passes issuer, contract, and jurisdiction review
- ZEC representation: native transparent ZEC only, with no Phlebas receipt or platform balance
- Settlement: one two-chain conditional-lock workflow per fill, with wallet-controlled claim and refund paths
- Orders: versioned signed intents, maker nonce cancellation, account epoch, and exact chain and asset identities
- Matcher: offchain price-time priority with append-only sequencing evidence
- Liquidity: signed solver or maker quotes backed by inventory that remains in each provider's wallets until a swap is authorized
- Contracts: non-upgradeable stablecoin conditional locks with no arbitrary token, callback, or custody path
- Custody: none. Phlebas cannot sign, redirect, claim, or refund either user's assets

Every decision remains provisional until implementation, independent audits, legal review, executed wallet tests, and the launch gates pass.

## ZEC wallet compatibility

The target flow uses a wallet adapter or reviewable transaction artifact for the exact transparent P2SH fund, claim, and refund paths. ZIP 321 and TEX payment requests do not authorize those scripts and are not substitutes for swap transaction support.

No wallet is Phlebas verified today. A wallet must pass executed Testnet funding, claim, timeout refund, restart, fee, and reorganization tests for the exact script before the UI calls it compatible.

## Deployment boundary

Vercel may host the public interface, documentation, read-only public market data, and client-side preparation of unsigned terms. It must never store wallet keys, node credentials, the authoritative swap journal, or a service that can sign or spend either asset.

## Licensing and publication

The software in this repository is licensed under the Apache License 2.0. See `LICENSE` and [the license choice note](docs/LICENSE_CHOICE.md). That choice does not make Phlebas an exchange, a live-funds service, or an audited product.

## Read next

Start with [the product specification](docs/PRODUCT_SPEC.md), then read [the architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md), and [launch plan](docs/LAUNCH_PLAN.md).
