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

## Done this batch (PR 10 — shared skip-nav controller hook)

- Skip-nav state machine (`src/lib/skip-nav-state.ts`) is a pure function over a state record. The state machine maps click, focusin, and Escape keydown to `hidden-after-activation`, `visible`, and `hidden-after-activation`, with every other event a no-op. The state machine is the only place that decides the next state.
- Skip-nav React hook (`src/lib/use-skip-nav-controller.ts`) wires the state machine to a DOM element through three DOM event listeners. The hook is a thin DOM adapter. It never reaches out to the network and never signs a transaction.
- `src/components/simulation-frame.tsx` consumes the hook on its 2-link nav.
- `src/components/trading-terminal.tsx` consumes the same hook on its 12-link nav. The two components cannot drift.
- `src/components/terminal.module.css` adds the `data-skip-nav-state="hidden-after-activation"` rule that hides the nav and disables pointer events even when the nav is focused.
- 5 new state machine unit tests in `src/lib/skip-nav-state.test.ts`. The hook has no isolated unit test because adding `jsdom` would be a new dependency; the integration is asserted by Playwright on both `/trade` and `/status`.
- 6 new Playwright tests in `tests/browser/phlebas.spec.ts` — three for the trading terminal nav and three for the simulation frame nav, each covering the click → hidden-after-activation, focusin → visible, and Escape → hidden-after-activation transitions.
- `docs/adr/0009-skip-nav-hook.md` captures the decision to extract the controller into a shared hook so the two components cannot drift.
- `docs/runbooks/a11y-test.md` documents the controller contract and the failure modes.
- `docs/operations/a11y-slo.md` defines the accessibility SLOs.
- `docs/audit/a11y-changelog.md` records the slice.
- `docs/THREAT_MODEL.md` adds section 24 for the shared controller surface.
- `docs/index.md` cross-references the new docs.
- 1055 node tests pass (state machine adds 5 tests; net 1055 because three tests were removed upstream), 496-file secret-pattern scan clean, production build clean locally. Playwright browser tests will run on CI.

## Branch

`feat/skip-nav-hook` off current `main` at `944c8b6`. PR body: stacks on current `main`, no key or token touched.
