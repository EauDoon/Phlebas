# Phlebas progress

Read this first on every continue. Update it after every batch: done, next, blockers, branch.

Last updated: 31-08-2026 after the mainnet-readiness hardening batch was integrated with the latest contributor head.

## Branch

`codex/mainnet-readiness` integrates the current `feat/simulation-hardening` head from PR #19.

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
- Foundry Sepolia deploy script plus `scripts/record-sepolia-deploy.mjs`. Manifest stays `deployed: false` until `--mark-deployed` verifies a successful receipt and bytecode at every recorded address over Sepolia RPC.
- Session tickets bind keccak EIP-712 to settlement when a wallet is connected. SHA-256 remains the session-only simulation encoding.
- Wallet signing stays disabled until the verified manifest is deployed. Sign-and-submit also requires `NEXT_PUBLIC_PHLEBAS_SEPOLIA_SUBMIT=1`.
- Matcher persists book, receipts, recover, and sequence under `services/matcher/.data` on 127.0.0.1.
- Isolated local Compose under `services/` for gateway, matcher, and observer. Host ports bind `127.0.0.1`. Do not set `PHLEBAS_GATEWAY_URL` or `PHLEBAS_MATCHER_URL` on Vercel.
- Zebra observer and mint-attestation stubs: textest only, 10 confirmations, durable one-outpoint/one-mint replay protection, strict observation input, and conservative multi-observer confirmation agreement. No Zebra RPC. HTTP `/attest` is covered by a live loopback/restart test.
- License: Apache License 2.0 (`LICENSE`). Not MIT. Product language unchanged.
- Operator runbook for local Compose: `docs/OPERATOR_RUNBOOK.md`. Gateway, matcher, and observer health and incident steps.
- Public operator APIs accept only loopback HTTP services and remain unavailable on Vercel.
- Payout claim stub walks requested, screened, burn-submitted, payable, and unresolved states. Nothing is sent.
- Country access remains deny by default. Empty and loading market feeds fail closed.
- Fills, resting orders, and tape entries name the simulated settlement pair. Account epochs and invalidation are visible.
- LP burns remain available during a trading pause. Wallet, gateway, and review failures stay visible.
- Matcher health exposes a receipt cursor, sequence root, start time, and last-sequence time for local monitoring.
- EIP-712 and settlement calldata bind time-in-force and enforce Solidity integer widths; wallets recheck Sepolia immediately before signing.
- Settlement rejects high-s signatures, reentrancy, self-trades, invalid roles/assets, unsupported TIF behavior, and unsafe token-return conventions. Exact buyer, seller, and fee accounting is tested.
- AMM first mint uses geometric-mean shares with locked minimum liquidity; later mints use both reserves, LP exits remain open during a trading pause, and donation-aware burn/sync paths are tested.
- Matcher rejects replay, expiry, unapproved assets/venues, self-trades, unsupported multi-fill IOC/FOK, and fee caps that cannot settle. Signatures are mandatory outside explicit unit-test bypasses.
- Matcher, gateway, and observer mutations are serialized and use file fsync plus atomic rename. Corrupt or unexpectedly missing replay state fails closed. Windows lacks a portable directory-fsync barrier, which is documented without weakening file fsync or rename.
- Sepolia deployment requires distinct roles. The manifest is wired into runtime configuration and cannot be marked deployed without a complete, commit-bound successful Sepolia receipt and verified bytecode at every address.
- CI pins the Foundry action and toolchain. Contract invariants include 10,000-case AMM-product and settlement-rounding fuzz runs in the release check.

## Next

- Merge PR #19, then merge this updated hardening PR only after its combined exact head is green.
- Record and independently verify a real Arbitrum Sepolia deployment using approved role addresses.
- Build the authoritative append-only matcher/settlement service and custody attestation path on isolated infrastructure, not Vercel or the local JSON stores.
- Complete closed-testnet reorg, replay, signer-loss, reserve-deficit, recovery, load, and disaster-recovery drills.
- Complete independent contract/infrastructure audits, Apache-2.0 distribution review, legal/entity/country approvals, and named operational ownership.

## Blockers

- Mainnet remains a no-go: there is no production custody, reserve attester, mint controller, redemption service, identity/compliance tier, surveillance system, or independently audited deployment.
- The local JSON persistence added for testnet is intentionally single-process and is not the production authoritative ledger.
- Language bar still holds: never imply live, audited, trustless, private, shielded, or native-ZEC
- Vercel still must not hold spend keys, issue mainnet TEX, or run the authoritative matcher
