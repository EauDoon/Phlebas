# Phlebas current progress

> Current summary as of 01-09-2026. This document supersedes the earlier cumulative branch diary. It intentionally does not pin a commit SHA, because a progress file that names its own pre-commit head becomes stale as soon as it is committed.

## Current checkpoint

- Active UI branch: `feat/simulation-hardening` (PR #28). Teal Simple/Advanced terminal. Simple is the default Uniswap-style Market IOC ticket; Advanced keeps the CLOB. Public Vercel stays a no-value simulation.
- Merged: PR #26 education/skip-link 44px coverage.
- Prior integration: custodial gateway runtime removed from `main`.
- Product boundary: no-value production preview. The public application does not accept deposits, issue a receiver, mint or burn a redeemable asset, sign transactions, broadcast transactions, or move funds.
- Release boundary: production use with live funds remains blocked. Testnet and mainnet activation require separate evidence, review, and explicit authorization.
- The custody-capable TEX gateway and the legacy mint/reserve-attestation observer have been removed from the active runtime.
- Former gateway and legacy-observer ignored data remain untouched and outside source-control scope. The root Docker context categorically excludes every `**/.data` directory.
- The persistent matcher is the only service in the local Compose workflow. It holds no wallet key, constructs no transaction, and is not configured on Vercel.
- The native atomic-swap observer remains read-only reference code and is not part of Compose or the public production runtime.
- The AMM and LP surfaces remain historical in-browser simulations. They do not create deposits, withdrawals, or settlement authority.

## Superseded checkpoints and claims

The following statements from the old cumulative diary are historical and are not part of the current architecture:

- Old branch names and commit heads, including `feat/native-swap-state-machine` checkpoints.
- Gateway availability copy and caps such as `gatewayOffCopy` and `gatewayUnavailableCopy`.
- Gateway receiver, deposit, mint, burn, custody-signer, payout, or withdrawal mutation paths.
- The deleted legacy observer endpoints `/coverage`, `/attest`, and its confirmation-floor health surface.
- Claims that gateway or legacy-observer mutations are persisted.

Historical deposit and withdrawal tours remain explicitly labeled demonstrations. Their controls do not call a custody service or expose a payable receiver.

## Runtime and authority map

| Surface | Current role | Authority |
| --- | --- | --- |
| Next.js application | Landing, trading simulation, status, documentation, historical tours | No keys, no signing, no broadcast, no live-funds action |
| Persistent matcher | Loopback order sequencing and replayable receipts | Can sequence or halt orders, cannot settle or move value |
| Native swap libraries | Signed terms, evidence validation, deterministic state and recovery model | Reference implementation, no RPC or broadcast |
| Atomic-swap observer service | Read-only reference adapter | Not deployed, not in Compose, no custody or settlement authority |
| AMM and LP libraries | Historical deterministic simulation | No live liquidity or token contract |

The canonical native settlement authority is the signed swap terms plus verified chain evidence reduced through the journal-backed state machine. UI state, matcher receipts, and observer assertions cannot independently authorize a claim, refund, transfer, mint, or withdrawal.

## Current verification commands

Run from the repository root:

```powershell
npm run lint
npm run typecheck
npm test
npm run scan:secrets
npm run build
npm run test:browser
```

The secret scanner reads tracked bytes from `git ls-files`; it does not enumerate or read ignored service data. Docker containment is checked by `services/infra.test.ts`, which binds the matcher image to its exact transitive source-import closure and requires custody-data, secret, VCS, and build-output exclusions.

## Open release gates

- Keep Vercel free of `PHLEBAS_MATCHER_URL` and every local service.
- Complete current wallet compatibility evidence for exact native fund, claim, and refund transactions.
- Complete reviewed chain adapters, finality and reorganization policy, independent security review, legal review, operator recovery drills, monitoring, and reproducible deployment manifests.
- Obtain separate authorization before any Testnet value movement, contract deployment, funded address, RPC credential, push, PR merge, Vercel deployment, or mainnet activation.

Until those gates close, all public copy and actions must remain truthful about the no-value preview boundary.

## Done this batch (PR 11 — session export)

- Session export module (`src/lib/session-export.ts`) builds a deterministic, versioned JSON snapshot of the in-browser session state for a given market. The snapshot includes the account, the book, the fills, and the session log. The schema tag is `phlebas-session-snapshot` and the schema version is `1`.
- Session export serializer is deterministic for the same input and round-trips through `JSON.parse`. A `BigInt` replacer emits atoms as decimal strings so the bytes are portable.
- 5 new unit tests in `src/lib/session-export.test.ts` cover the schema tag, the default and explicit `exportedAt`, the deterministic round-trip, and the human-readable description.
- `src/components/order-blotter.tsx` adds a `Copy session JSON` button in the panel header. Clicking builds a snapshot, writes it to the clipboard, and updates the button label to `Copied session JSON` or `Copy failed` depending on the clipboard result. The button is the second of two header actions; the existing `Reset session` button is preserved.
- `src/components/trading-terminal.tsx` now passes the full `Book` to the order blotter so the snapshot can include the bids, asks, sequence, and last ticks.
- 2 new Playwright tests in `tests/browser/phlebas.spec.ts`: the happy path copies a parseable JSON snapshot to the clipboard, and a no-clipboard fallback reports `Copy failed` instead of crashing.
- 1055 node tests pass (session-export adds 5 tests; the state machine is on a separate branch), 496-file secret-pattern scan clean, production build clean locally. Playwright browser tests will run on CI.

## Branch

`feat/session-export` off current `main` at `944c8b6`. PR body: stacks on current `main`, no key or token touched.
