# Phlebas progress

Read this first on every continue. Update it after every batch: done, next, blockers, branch.

Last updated: 31-08-2026 after simulation-hardening checks (92 unit tests, 27 Playwright, production build).

## Branch

`feat/simulation-hardening` off `main` at `6984290` (PR #16). One multi-feature PR.

## Done

- In-browser price-time matcher (GTC, IOC, FOK), session inventory, blotter, click-to-price, depth
- Review-and-confirm before simulated fills (custody notice, worst price, CLOB vs AMM, SHA-256 digest)
- Integer AMM quotes, amount-in inversion, LP share mint/burn
- Append-only session log that replays to the same book and balances
- `/status`, `/api/status`, branded 404/error, ZIP 321 copy (placeholder, not payable)
- CI: `npm run check` (includes secret scan) plus Playwright Chromium
- Public production: https://phlebas.vercel.app (noindex). Still a no-value simulation.
- Integer seed books, chart ticks, and 24h stats without float `toFixed` conversion
- Split-route (CLOB + AMM) comparison with a signed worst-price bound; confirm still executes CLOB only
- Empty, stale, and unavailable ticket gates from PRODUCT_SPEC §10, with retry to illustrative
- Playwright fixture binds `127.0.0.1` on an OS-assigned free port
- Transparent destination inspector: shielded, TEX, and payment-request inputs are rejected; nothing is sent

## Next

- None on the in-scope simulation slice

## Blockers

- None for simulation work
- Out of scope until an explicit ask: testnet contracts, receivable TEX, live wallets, keccak EIP-712 signatures, production matcher
- Language bar still holds: never imply live, audited, trustless, private, shielded, or native-ZEC
