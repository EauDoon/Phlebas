# Phlebas Progress

Read this first on every continuation. Update it after each merged batch.

Updated: 31-08-2026 after PR #21 merged to `main` at `84a3224645e5ef8e3d95b49eb98345fa8fd3eb16`.

## Goal

Build a live, fully functioning, non-custodial exchange for native transparent ZEC against USDC and USDT. Keep every user and solver key in its wallet. Continue through missing-key boundaries and gate only the exact signing, broadcast, or deployment action that requires a key.

## Current branch

`feat/native-swap-state-machine`, based on `main` at `84a3224645e5ef8e3d95b49eb98345fa8fd3eb16`.

The next PR contains at least eight meaningful commits, an independent current-byte review, a Vercel preview for the exact head, and production verification after merge.

## Delivered on main

* Original landing page and responsive trading terminal for `ZEC/USDC` and `ZEC/USDT`
* In-browser price-time matcher with GTC, IOC, FOK, partial fills, cancellation, session inventory, and replay
* Side-aware integer simulation settlement and dust protection
* Integer AMM, routing comparison, and LP preview for the superseded pZEC simulation
* Empty, loading, stale, and unavailable market-data gates
* SHA-256 session digests and keccak EIP-712 typed data for the legacy Sepolia slice
* Optional EIP-1193 Sepolia wallet flow, with submission disabled until the manifest is verified
* Undeployed pZEC, quote-token, settlement, factory, pair, and router contracts for no-value Sepolia testing
* Loopback gateway, matcher, and observer services with serialized atomic persistence and replay controls
* Transparent destination inspection, ZIP 321 and TEX testnet surfaces, and a no-send payout tour
* Status, legal, and security routes, security headers, no-index policy, error surfaces, CI, and Vercel production

Current-main release evidence:

* 261 unit and service tests
* 22 Foundry tests
* lint and type checking
* secret-pattern scan across 185 files
* production build
* 46 Chromium browser tests
* GitHub Verify run `33395000049`
* successful production Vercel deployment `4eyFnx8i7LjWoJUs4RTgdRzQrBEr` for merge `84a3224`

The pZEC gateway, reserve, mint, burn, payout, passive AMM, and Sepolia contract surfaces are retained as legacy simulation and testnet code. They do not define the production target.

## Active batch

* Define immutable per-fill native swap terms, SHA-256 digest, and unique swap identifier
* Enforce ZEC-first funding and a versioned, strictly ordered timeout policy
* Model exact Zcash and EVM funding, claim, refund, conflict, and reorganization evidence
* Keep claim and refund mutually exclusive while preserving a wallet-controlled recovery path
* Chain idempotent journal receipts with prior and next state roots
* Restore only complete digest-bound replay snapshots
* Add a deterministic fixture-only settlement ticket and unsafe-state browser journeys
* Preserve the no-key, no-RPC, no-broadcast, and no-live-funds boundary

The protocol domain and adversarial suite pass locally. Publication still requires the integrated UI, full repository checks, an independent exact-head review, fresh GitHub Verify, and a Vercel preview for that exact head.

## Next batches

1. Zcash transparent P2SH transaction lab and wallet adapter
2. EVM exact-token conditional-lock contracts on local chains
3. Read-only observers, persistent coordinator, and watchtower
4. Approved Testnet wallet execution
5. Persistent matcher and public market data
6. Wallet-held solver liquidity
7. Operations and production hardening

## Gates

No key is needed for the active batch.

HOLD:

* wallet signing or new wallet connection;
* Zcash or EVM broadcast;
* Testnet or Mainnet deployment;
* funded addresses or real assets;
* wallet compatibility labels;
* production contract identities;
* passive Uniswap v2 LP claims for native ZEC;
* live-exchange claims.

Each item remains on HOLD until its protocol, test, audit, legal, operational, and authorization gates pass.
