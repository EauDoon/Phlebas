# Phlebas

Phlebas is a production-minded protocol design and no-value interface simulation for ZEC markets against USDC and USDT. The interface uses the familiar market labels `ZEC/USDC` and `ZEC/USDT`, while the proposed Arbitrum settlement assets are `pZEC-USDC` and `pZEC-USDT0`.

> Status: no-value simulation with optional local testnet services. Contracts are in-repo and undeployed. The public matcher is in-browser. A local operator, testnet TEX gateway, and Arbitrum Sepolia wallet connector exist and do not move mainnet funds. It is not an exchange and is not an offer of financial services.

## Product boundary

Native ZEC is not an ERC-20 token and cannot sit directly inside an EVM constant product pool. The reference design therefore separates three systems:

1. A transparent-Zcash gateway observes confirmed native ZEC deposits and would issue a fully reserved, 8-decimal `pZEC` receipt.
2. Arbitrum contracts would settle signed order-book trades and host constrained constant product pools for `pZEC/USDC` and `pZEC/USDT0`.
3. A public web interface presents markets and prepares user-signed actions without holding custody keys or operating the authoritative matcher.

This is a hybrid DEX design. The AMM and trade settlement can be onchain, but the proposed ZEC gateway is custodial and the order matcher is an offchain operator. The project must not be described as trustless, private, shielded, or native-ZEC settlement.

## Included in this candidate

- A responsive trading terminal for `ZEC/USDC` and `ZEC/USDT`
- An original landing page with explicit system-status disclosures
- An in-browser price-time matcher (GTC, IOC, FOK) with session inventory, open orders, fills, and an append-only replay log
- Canonical PRODUCT_SPEC order encoding with a SHA-256 simulation digest and a keccak EIP-712 typed-data hash
- Integer CLOB vs AMM split-route comparison and LP share mint/burn previews
- Integer seed books, empty/stale/unavailable ticket gates, and a transparent-destination inspector
- Click-to-price depth, local last/spread, and slippage-bounded market orders as IOC
- Integer constant-product quotes and local add/swap previews for `pZEC/USDC` and `pZEC/USDT0`
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
| `services/` | Isolated local Compose: gateway, matcher, observer stubs. Never on Vercel. |
| `infra/testnet` | Undeployed Sepolia manifest |
| `docs/PRODUCT_SPEC.md` | Markets, order semantics, LP scope, and user flows |
| `docs/DELIVERY_PLAN.md` | Agent Team workstreams, PR sequence, and release protocol |
| `docs/BROWSER_ACCEPTANCE.md` | Reproducible responsive, keyboard, and reduced-motion checks |
| `docs/LANDING_AND_USER_JOURNEYS.md` | Landing, trader, LP, deposit, and withdrawal experience |
| `docs/ARCHITECTURE.md` | System boundaries and proposed production topology |
| `docs/ASSET_AND_ACCOUNTING.md` | pZEC, reserves, liabilities, and reconciliation |
| `docs/WALLET_COMPATIBILITY.md` | Current ZEC wallet evidence and executable Testnet qualification |
| `docs/THREAT_MODEL.md` | Abuse cases, invariants, tests, and stop conditions |
| `docs/OPERATIONS.md` | Proposed services, observability, and incident control |
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

## Proposed production decisions

- Network: Arbitrum One, chain ID `42161`
- Quote assets: native Circle USDC first, USDT0 only after a separate issuer and jurisdiction gate
- ZEC representation: non-upgradeable `pZEC`, 8 decimals, mint and burn restricted to the gateway
- Orders: EIP-712 signed intents, atomic onchain settlement, maker cancellation bitmap and account epoch
- Matcher: offchain price-time priority with append-only sequencing evidence
- AMM: fixed 30 basis point fee, no farms, gauges, leverage, flash callbacks, or arbitrary pair creation
- Administration: non-upgradeable core contracts, timelocked governance, narrow emergency pause powers
- Custody: threshold controls, independent Zcash observers, public reserve and liability reconciliation, no lending or rehypothecation

Every decision remains provisional until implementation, independent audits, legal review, custody validation, and the launch gates pass.

## ZEC wallet compatibility

The proposed deposit flow does not invent an EVM-style ZEC wallet connector. It uses a unique TEX address, a standard ZIP 321 `zcash:` payment request, QR or copy-and-paste handoff, and independent chain observation. Withdrawals accept only a network-correct transparent destination under the proposed policy.

No wallet is Phlebas verified today. The [wallet compatibility plan](docs/WALLET_COMPATIBILITY.md) separates maintainer-documented capabilities from executed interoperability evidence and defines the Testnet suite a wallet must pass before the UI can call it compatible.

## Deployment boundary

Vercel may host the public, stateless interface, documentation, read-only public market data, and client-side transaction preparation. It must never store custody or mint keys, operate Zcash nodes, coordinate withdrawals, maintain the authoritative customer-liability ledger, or host sanctions and identity casework.

## Licensing and publication

The software in this repository is licensed under the Apache License 2.0. See `LICENSE`. That choice does not make Phlebas an exchange, a live-funds service, or an audited product.

## Read next

Start with [the product specification](docs/PRODUCT_SPEC.md), then read [the architecture](docs/ARCHITECTURE.md), [threat model](docs/THREAT_MODEL.md), and [launch plan](docs/LAUNCH_PLAN.md).
