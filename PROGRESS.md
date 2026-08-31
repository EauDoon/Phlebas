# Phlebas Progress

Read this first on every continuation. Update it after each merged batch.

Updated: 31-08-2026 after PR #19 and PR #20 merged to `main` at `a2569b35963ff46f2ab628059c7a997f6929d7d7`.

## Goal

Build a live, fully functioning, non-custodial exchange for native transparent ZEC against USDC and USDT. Keep every user and solver key in its wallet. Continue through missing-key boundaries and gate only the exact signing, broadcast, or deployment action that requires a key.

## Current branch

`feat/native-zec-swap-domain`, rebased from `main` at `a2569b35963ff46f2ab628059c7a997f6929d7d7`.

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

* 203 unit and service tests
* 22 Foundry tests
* lint and type checking
* secret-pattern scan across 170 files
* production build
* 46 Chromium browser tests
* GitHub Verify run `33389882770`
* successful production Vercel deployment for merge `a2569b3`

The pZEC gateway, reserve, mint, burn, payout, passive AMM, and Sepolia contract surfaces are retained as legacy simulation and testnet code. They do not define the production target.

## Active batch

* Supersede the custody-backed pZEC target with native-ZEC atomic settlement
* Define exact Zcash and EVM chain and asset identities
* Add a versioned EIP-712 native order intent
* Add strict order policy, nonce and epoch cancellation, chained intake receipts, and price-time plans
* Add deterministic settlement accounting, replay snapshots, and adversarial persistence checks
* Bind every current surface to simulation and no-live-funds product truth
* Preserve the no-key and no-chain boundary for this batch

The pre-rebase branch passed an independent P0/P1 review and an independent Foundry EIP-712 digest comparison. After rebasing onto merged `main`, integration tree `fcb34d5` passed lint, type checking, 259 unit and service tests, 22 Foundry tests, a 185-file secret-pattern scan, the production build, and all 46 Chromium browser tests. The subsequent snapshot-integrity repair passes the same gates with 261 unit and service tests. Publication still requires a clean final-head review plus fresh GitHub Verify and Vercel results for that exact head.

## Next batches

1. Native two-chain swap state machine and lock, claim, refund UI
2. Zcash transparent P2SH transaction lab and wallet adapter
3. EVM exact-token conditional-lock contracts on local chains
4. Read-only observers, persistent coordinator, and watchtower
5. Approved Testnet wallet execution
6. Persistent matcher and public market data
7. Wallet-held solver liquidity
8. Operations and production hardening

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
