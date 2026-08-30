# Phlebas progress

Read this first on every continue. Update it after every batch: done, next, blockers, branch.

Last updated: 31-08-2026 after PR #15 merged.

## Branch

`main` at `bf7d7f5` (PR #15). No open feature branch. Next work starts a new branch off `main`.

## Done

- In-browser price-time matcher (GTC, IOC, FOK), session inventory, blotter, click-to-price, depth
- Review-and-confirm before simulated fills (custody notice, worst price, CLOB vs AMM, SHA-256 digest)
- Integer AMM quotes, amount-in inversion, LP share mint/burn
- Append-only session log that replays to the same book and balances
- `/status`, `/api/status`, branded 404/error, ZIP 321 copy (placeholder, not payable)
- CI: `npm run check` (includes secret scan) plus Playwright Chromium
- Public production: https://phlebas.vercel.app (noindex). Still a no-value simulation.

## Next

- Keep building the simulation terminal, not live funds
- Integer seed books without float `toFixed` conversion
- Split-route (CLOB + AMM) instead of winner-take-all comparison
- Empty / stale / unavailable ticket states from PRODUCT_SPEC §10
- Fixture Playwright so port 3108 leftovers do not fail the first worker

## Blockers

- None for simulation work
- Out of scope until an explicit ask: testnet contracts, receivable TEX, live wallets, keccak EIP-712 signatures, production matcher
- Language bar still holds: never imply live, audited, trustless, private, shielded, or native-ZEC
