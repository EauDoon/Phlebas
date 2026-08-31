# Phlebas progress

Read this first on every continue. Update it after every batch: done, next, blockers, branch.

Last updated: 31-08-2026 after local Compose infra, textest observer stubs, and Apache-2.0.

## Branch

`feat/simulation-hardening` off `main` at `873e1cd` (PR #18). One multi-feature PR.

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
- Keccak-256 plus EIP-712 `Order` typed-data hashing for Arbitrum Sepolia (`PhlebasSettlement` v1). Session tickets still use SHA-256.
- No-value Arbitrum Sepolia contracts: tpZEC, quote faucets, settlement, factory, pair, router. Typehashes match the TypeScript vectors. Undeployed.
- Receivable testnet TEX via a local gateway (`textest` only, single-use ledger). Public app issues nothing without `PHLEBAS_GATEWAY_URL`.
- Injected EVM wallet connector limited to Arbitrum Sepolia. Signing does not submit a settlement transaction.
- Local matcher operator sequences, recovers EIP-712 signatures, and matches. Not bundled into Vercel.
- Foundry Sepolia deploy script plus `scripts/record-sepolia-deploy.mjs`. Manifest stays `deployed: false` until `--mark-deployed` sees a real tx.
- Session tickets bind keccak EIP-712 to settlement when a wallet is connected. SHA-256 remains the session-only simulation encoding.
- Wallet sign-and-submit is behind `NEXT_PUBLIC_PHLEBAS_SEPOLIA_SUBMIT=1`. Default is sign-only. Zero settlement address cannot send a tx.
- Matcher persists book, receipts, recover, and sequence under `services/matcher/.data` on 127.0.0.1.
- Isolated local Compose under `services/` for gateway, matcher, and observer. Host ports bind `127.0.0.1`. Do not set `PHLEBAS_GATEWAY_URL` or `PHLEBAS_MATCHER_URL` on Vercel.
- Zebra observer and mint-attestation stubs: textest only, 10 confirmations, one outpoint one mint. No Zebra RPC.
- License: Apache License 2.0 (`LICENSE`). Not MIT. Product language unchanged.

## Next

- Record a real Arbitrum Sepolia broadcast in the manifest (blocked on an approved deployer key; do not `--mark-deployed` without a tx)

## Blockers

- None for this slice
- Language bar still holds: never imply live, audited, trustless, private, shielded, or native-ZEC
- Vercel still must not hold spend keys, issue mainnet TEX, or run the authoritative matcher
