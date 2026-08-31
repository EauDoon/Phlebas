# Phlebas progress

Read this first on every continue. Update it after every batch: done, next, blockers, branch.

Last updated: 31-08-2026 after incorporating the latest product UI commits and current main for PR #22.

## Branch

`feat/product-ui` now includes current `main` at `84a3224645e5ef8e3d95b49eb98345fa8fd3eb16` for PR #22. PR #22: https://github.com/EauDoon/Phlebas/pull/22. Origin `feat/simulation-hardening` remains separate; do not force-push it.

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
- License: Apache License 2.0 (`LICENSE`, `docs/LICENSE_CHOICE.md`). Not MIT. Product language unchanged.
- Operator runbook for local Compose: `docs/OPERATOR_RUNBOOK.md`. Gateway, matcher, and observer health and incident steps. Loopback HTTP tests cover issue, sequence health, attest, quarantine, and disagreement.
- Public `/api/deposit-intent` and `/api/matcher` only proxy `http://127.0.0.1` (or localhost / `[::1]`) with no path. Anything else, including unset, is 503.
- Public operator APIs accept only loopback HTTP services and remain unavailable on Vercel.
- Payout stub: one burn, one transparent-shape destination, never TEX or shielded. Withdrawal inspector previews the stub and still sends nothing.
- Observer reorg drops off-chain and under-confirmed observations.
- Country access default deny, empty enable list, shown on the landing ledger and `/status`.
- Matcher loopback POST rejects a signature that does not recover to the maker.
- Direct operator processes refuse `0.0.0.0` unless `PHLEBAS_ALLOW_NON_LOOPBACK=1` (Compose only).
- SECURITY.md matches the current simulation-plus-local-stubs boundary.
- Public `/api/deposit-intent` and `/api/matcher` refuse operator URLs with a path, user, TLS, query, or hash.
- Matcher health publishes a keccak sequence root over sequence plus receipt digests.
- Production CSP `connect-src` is `'self'` only; `ws:`/`http:` are development-only. Asserted in `copy-boundary.test.ts`.
- Secret scan fails `PHLEBAS_GATEWAY_URL` / `PHLEBAS_MATCHER_URL` in committed `.env`, `vercel.json`, or `.vercel/` files.
- THREAT_MODEL, ARCHITECTURE, and landing-journey current-reality match the simulation-plus-local-stubs boundary.
- Matcher persist ignores corrupt `state.json` and starts empty. Covered by a unit test.
- Payout pre-burn screen: requested destinations are screened or rejected before a burn id is spent. Withdrawal inspector uses the screen; nothing is sent.
- Observer `POST /coverage` reproduces `calculateReserveCoverage` from public inputs. Not a live reserve monitor.
- Matcher health publishes `startedAt` and `lastSequenceAt` for third-party downtime polling.
- Matcher `GET /sequence?after=N` is the receipt cursor. Observer `/attest` fails closed when a supplied reserve snapshot is uncovered.
- Gateway loopback issue cap defaults to 64 intents (`PHLEBAS_GATEWAY_MAX_INTENTS`). Further issues are 429.
- Persist restore keeps the same sequence root. Operator runbook notes Windows ignores POSIX `0o600` on the gateway master key.
- Payout claim stub walks requested → screened → burn-submitted → payable / unresolved. Nothing is sent.
- Gateway issued count persists under `services/gateway/.data/issued`, so the intent cap survives a process restart. Corrupt issued files and a master key without `issued` fail closed at the cap.
- Matcher persist stores the sequence root. A tampered root is ignored and the matcher starts empty.
- Withdrawal tour drives `payoutClaimForTourStep` without changing tour copy. Stub claim state is visible. Nothing is sent.
- Fills, resting orders, and the tape name the settlement pair (`pZEC-USDC` / `pZEC-USDT0`).
- Account epoch is visible on the ticket and blotter. Invalidate older session orders increments it.
- LP trading pause disables mint and swap; burn stays available.
- Wallet connect failures are visible. Gateway issue shows an issuing state.
- Review repeats assets, fees, custody, and public-linkability (PRODUCT_SPEC §10).
- Empty feed shows empty depth. Loading feed disables review.
- `/api/status` never copies a remote operator URL. `intentCap` is 64 only when the gateway URL is loopback HTTP. `sequenceRoot` stays null without a fetched loopback matcher.
- Blotter tables scroll inside the panel so the settlement column cannot blow the 320px page.
- LP panel previews integer IL versus hold at 4x and 1/4x pZEC/quote, plus session IL after mint. Not a return projection.
- Gateway health publishes `issued` and `cap` from the shared `GATEWAY_DEFAULT_MAX_INTENTS` (64).
- Ticket and LP copy bind to version-1 fee constants (5 / 15 / 30 bps, max 30).
- Public `/status` shows intent cap `unset` when no loopback gateway URL is configured.
- Matcher health reports `persistReadable`. Observer health reports the 10-confirmation floor.
- Session ticket expiry is unix time or 0 for none. It binds the SHA-256 canonical encoding and the keccak typed order.
- Playwright covers market-IOC worst price, expiry on review, IL versus hold, and `/status` intent-cap `unset`.
- Ticket shows the next session nonce beside epoch. Invalid expiry keeps review closed.
- First-session education dialog on `/trade` and `/liquidity` (`phlebas.previewEducationVersion = 2026-08-30-1`). Education, not consent. Force with `?education=1`. Escape dismisses it. 320px keeps the dialog and Continue at 44px.
- Country-blocked state demonstration via allowlisted `?access=blocked` on `/trade` and `/liquidity`. Never infers location.
- Deposit state tour: Eligibility through Complete. Address request never shows a receivable address.
- `/legal` and `/security` simulation pages. Landing and terminal footers: Architecture, Legal, Security, Status. No GitHub URL.
- LP mint and swap use review-and-confirm repeating PRODUCT_SPEC §10. Burn stays available during a trading pause.
- Architecture labeled incident demonstrations: blocked, review, reorg, planned and unplanned maintenance. Incident select is a 44px target.
- Ticket keyboard: G/I/F time in force, Escape back from review. Shortcuts ignore an open dialog.
- Landing journey chooser: four manual tabs (Trader, LP, Deposit, Withdrawal). Arrow keys move focus; Enter/Space selects. Without JavaScript, all four descriptions remain. Header Liquidity selects LP after hydration.
- Landing evidence rows: order book, LP math, gateway design, published boundary.
- Landing terminal preview (`#terminal-preview`): labeled Simulation, illustrative ZEC/USDC depth and a non-submitting ticket slice. Header Markets points here. No wallet, fill, or payable address.
- Mainnet gates: six evidence rows, all `Not cleared`. Action is Read the launch gates.
- pZEC section cites ZIP 320 and states no shielded deposit or withdrawal for v1.
- `/status` links to legal, security, architecture, and launch gates.
- Session blotter log line includes expiry when a ticket is confirmed. Nonce-bitmap helper matches Settlement.sol (`word = nonce >> 8`, `bit = 1 << uint8(nonce)`).
- In-browser matcher rejects a taker whose unix expiry has passed and drops resting orders after that unix time. Replay still omits `nowUnix` so a logged submit reconstructs.
- Ticket shows a rejected panel (role=alert) for expiry, matcher reject, inventory, and self-trade. Retry is safe.
- Blotter tabs expose one tabpanel each, with arrow/Home/End keys and Enter/Space select.
- Landing hero, current-system ledger, and pZEC heading match LANDING_AND_USER_JOURNEYS copy. Wallet row is Unavailable, not Optional Sepolia.
- Landing skip links reach journeys, evidence, and the terminal preview.
- EIP-712 and settlement calldata bind time-in-force and enforce Solidity integer widths; wallets recheck Sepolia immediately before signing.
- Settlement rejects high-s signatures, reentrancy, self-trades, invalid roles/assets, unsupported TIF behavior, and unsafe token-return conventions. Exact buyer, seller, and fee accounting is tested.
- AMM first mint uses geometric-mean shares with locked minimum liquidity; later mints use both reserves, LP exits remain open during a trading pause, and donation-aware burn/sync paths are tested.
- Matcher rejects replay, expiry, unapproved assets/venues, self-trades, unsupported multi-fill IOC/FOK, and fee caps that cannot settle. Signatures are mandatory outside explicit unit-test bypasses.
- Matcher, gateway, and observer mutations are serialized and use file fsync plus atomic rename. Corrupt or unexpectedly missing replay state fails closed. Windows lacks a portable directory-fsync barrier, which is documented without weakening file fsync or rename.
- Sepolia deployment requires distinct roles. The manifest is wired into runtime configuration and cannot be marked deployed without a complete, commit-bound successful Sepolia receipt and verified bytecode at every address.
- CI pins the Foundry action and toolchain. Contract invariants include 10,000-case AMM-product and settlement-rounding fuzz runs in the release check.
- Chart, 24h stats, depth, and LP mint/swap reuse ticket-gate feed names. Empty, loading, and unavailable withhold fixtures. Chart panel keeps height. Stale still shows delayed fixtures.
- ZIP 321 placeholder QR is labeled not payable. Clipboard failure and missing clipboard stay honest. Nothing is sent.
- Ticket G/I/F stay idle while review is open. Escape leaves review. Shortcuts ignore native dialogs.
- Status names architecture incident demonstrations and is not an incident feed. Terminal and simulation-frame footers include Launch gates.
- Chart range and LP pool choice are radiogroups with arrow/Home/End keys.
- Skip links reach the order ticket, price chart, order book, and blotter.
- Ticket validation errors sit beside price, size, slippage, and expiry, with `aria-errormessage`.
- Review sheets repeat the later listing gate for `ZEC/USDT` and `pZEC/USDT0`.
- App Router `loading.tsx` names a simulation and withholds prices. Open Graph and Twitter cards say no-value simulation.
- Local fill copy says nothing was signed or submitted to a chain. Simulation error Retry uses the primary action style.
- Playwright covers feed surfaces, placeholder QR, clipboard failure, G/I/F during review, skip-to-chart, chart-range arrows, field errors, USDT review listing-gate, LP pool arrows, and OG metadata.
- Terminal view tabs move focus with arrows and select with Enter/Space, matching blotter tabs
- LP amount field errors use `aria-errormessage` and keep review closed
- 24h volume and LP TVL visible values are labeled Fixture
- Ticket keyboard copy is a named 44px region
- Withdrawal tour includes an unresolved demonstration; stub claim stays unresolved and nothing is sent
- Chart SVG pixel coordinates are documented display floats; axis labels stay integer ticks
- Playwright covers view-tab arrows, LP field errors, fixture-labeled volume, shortcut region, and unresolved withdrawal
- Ticket side, type, and time-in-force groups move focus with arrows and select with Enter/Space
- Size percent shortcuts are 44px on desktop
- Gateway deposit/withdrawal journey buttons move with arrows
- Landing terminal preview depth names last, price, and size as Fixture
- Status skip link reaches the status ledger
- Playwright covers ticket-group arrows, 44px size shortcuts, gateway journey arrows, preview fixture labels, and status skip
- Market and feed-state selectors move with arrows, Home/End, and Enter/Space the way blotter tabs do
- Review Back and ticket primary actions stay 44px at desktop, not only under 820px
- LP mint, swap, and burn tour buttons stay 44px on desktop
- `/legal` and `/security` skip to the article the way status skips to the ledger
- Architecture incident demonstrations keep the selected copy in a named region
- Market bar keeps market and feed selectors inside the panel when USDT listing-gate copy appears
- Playwright covers market/feed arrows, desktop 44px review Back, LP tour targets, legal and security skip, and the incident region
- Market and feed selector tabs stay 44px on desktop, not only under 820px
- Ticket side segmented buttons stay 44px on desktop
- Wallet connect stays 44px on desktop
- Chart range buttons stay 44px on desktop
- 404 page skips to the missing-route copy
- Architecture skips to the incident demonstration
- Playwright covers desktop 44px market/feed tabs, connect, chart range, ticket side, 404 skip, and architecture skip
- Ticket order-type buttons stay 44px on desktop
- Terminal view tabs stay 44px on desktop
- Blotter tabs stay 44px on desktop
- Liquidity skips to the pool tabs
- Destination inspector stays on both gateway journeys; bridge skips to it
- Playwright covers desktop 44px order-type, view, and blotter tabs, liquidity skip, and bridge skip
- Allowlisted `?error=1` is a labeled rendering-failure demonstration; Retry is safe; nothing is submitted
- Error page skips to the retry copy
- Global-error Retry stays 44px and skips to the retry copy
- Order book price rows stay 44px on desktop
- Playwright covers error skip, 44px GTC, and 44px order-book price rows. Global-error Retry is asserted in copy-boundary because it is not a public route.
- Reset session, blotter Cancel, Cancel all, and Invalidate older session orders stay 44px on desktop
- Retry illustrative feed stays 44px on desktop
- Recent-trade tape rows stay 44px on desktop
- Trade skip links reach recent trades
- Playwright covers 44px Reset, Cancel, Retry illustrative, tape rows, and recent-trades skip
- Session-last / mid-price row stays 44px on desktop
- Blotter fills and inventory rows stay 44px on desktop
- Allowlisted `?loading=1` shows the simulation loading copy with prices withheld
- Loading copy skips to the withheld-price notice
- Playwright covers 44px mid-price, fills, inventory rows, and loading skip
- Blotter event-log rows stay 44px on desktop
- LP pool-stats rows stay 44px on desktop
- Chart empty state is a named 44px region
- Order-book empty state stays 44px on desktop
- Liquidity skips to pool stats
- Playwright covers 44px event-log, LP stats, chart empty, and pool-stats skip
- Ticket inline notices stay 44px on desktop
- Wallet-provider rejection is a named 44px notice
- Terminal and landing simulation banners stay 44px and are named Simulation disclosure
- Playwright covers 44px ticket notice, wallet rejection, and simulation banners
- Ticket blocked and gate notices stay 44px on desktop
- Country-block notice stays 44px; skip reaches it; trade skips stay hidden while blocked
- Education dialog copy is a named 44px region
- Playwright covers 44px ticket blocked, gate, country-block, education copy, and country-block skip
- Architecture honesty bar stays 44px and is a named skip target
- Selected incident demonstration copy stays 44px on desktop
- Ticket and LP review custody notices are named 44px regions
- Playwright covers 44px honesty bar, incident copy, review custody, and honesty-bar skip
- Bridge privacy callouts stay 44px on desktop and are a named skip target
- Landing evidence rows stay 44px on desktop and are a named list
- Architecture layer cards stay 44px on desktop and are a named skip target
- Playwright covers 44px privacy callouts, evidence rows, layer cards, privacy skip, and layers skip
- Status, legal, and security ledger rows stay 44px on desktop
- Landing skip links follow on-page order: markets, evidence, pZEC, terminal preview, journeys, launch gates
- Landing skip links reach markets, pZEC, and launch gates
- Landing market cards and launch gates are named lists
- Landing mobile menu links stay 44px
- Playwright covers 44px status ledgers, named market cards and launch gates, landing skips in page order, and menu links
- Landing current-system ledger is a named list
- Landing no-JS journey cards are a named list
- Landing desktop nav and footer links stay 44px on desktop
- Simulation-frame and terminal footer rows stay 44px on desktop
- Landing pZEC flow steps stay 44px on desktop
- Playwright covers 44px landing nav, footer, pZEC flow, simulation-frame and terminal footer links, and named current-system and no-JS journey lists
- Status, legal, and security ledgers are named lists
- Landing header Enter simulation stays 44px on desktop
- Simulation-frame primary nav links stay 44px on desktop
- Landing journey tabs stay 44px on desktop
- Landing pZEC ZIP 320 source link stays 44px on desktop
- Playwright covers 44px header CTA, journey tabs, pZEC source, simulation-frame nav, and named status ledgers
- Landing hero Enter simulation and Understand pZEC stay 44px on desktop
- Landing Open status details stays 44px on desktop
- Landing Read the launch gates stays 44px on desktop
- Simulation-frame and terminal brand home links stay 44px on desktop
- Playwright covers 44px hero CTAs, Open status details, launch-gates link, and brand home links
- Landing market Preview market links stay 44px on desktop
- Landing journey panel actions stay 44px on desktop
- Landing no-JS journey card actions stay 44px on desktop
- Landing header brand home stays 44px on desktop
- Playwright covers 44px market preview links, journey actions, no-JS journey actions, and landing brand
- Status, legal, and security in-page links stay 44px on desktop
- Landing skip links stay 44px on desktop
- Landing Menu and Close stay 44px
- Playwright covers 44px status in-page links, landing skip links, and Menu/Close
- Terminal and simulation-frame skip links stay 44px on desktop
- Education Continue stays 44px on desktop
- Error Retry stays 44px on desktop
- Playwright covers 44px terminal skip links, education Continue, and error Retry
- 404 skip and missing-route copy stay 44px on desktop
- Loading skip and withheld-price notice stay 44px on desktop
- Education Back and Enter simulation stay 44px on desktop
- Playwright covers 44px 404 skip, loading skip, education Back, and education Enter simulation
- Deposit and withdrawal tour buttons stay 44px on desktop
- Retry copy region stays 44px on desktop
- Country-block skip stays 44px on desktop
- Playwright covers 44px tour buttons, retry copy, and country-block skip
- Architecture skip, honesty-bar skip, and layers skip stay 44px on desktop
- Liquidity pool-tabs skip and pool-stats skip stay 44px on desktop
- Bridge destination-inspector skip and privacy-callouts skip stay 44px on desktop
- Playwright covers 44px architecture, liquidity, and bridge skip links
- Trade skip links (ticket, chart, book, blotter, tape) stay 44px on desktop
- Incident demonstration skip stays 44px on desktop
- Playwright covers 44px trade skips and incident skip
- Skip-target scroll-margin applies to unhashed ids
- Status, legal, and security skip links stay 44px on desktop
- Playwright covers 44px status/legal/security skips and skip-target scroll-margin
- Trade skip targets keep 12px scroll-margin
- Landing skip sections keep 12px scroll-margin
- Landing skip links keep a 2px focus ring
- Playwright covers skip-target scroll-margin on trade and landing, and skip-link focus ring
- Terminal skip links keep a 2px focus ring
- Skip-nav leaves 12px inset so the skip-link focus ring is not clipped
- Landing pZEC, journeys, and launch-gates skip targets keep 12px scroll-margin
- Playwright covers terminal skip-link focus ring, skip-nav inset, and remaining landing skip-margins
- Reduced-motion keeps skip-nav in place without a slide
- Landing overflow clip leaves 8px so the skip-link focus ring is not clipped
- Skip-nav remains above the simulation banner
- Playwright covers reduced-motion skip-nav, skip-link ring not clipped, and skip-nav stacking
- Terminal simulation banner stays below skip-nav
- Skip-nav does not cover the header brand at 320px under reduced motion until focused
- Skip-link focus stays inside the viewport at 320px
- Playwright covers terminal banner stacking, 320px reduced-motion skip-nav vs brand, and 320px skip-link ring
- Focused skip-nav stays in flow at 320px so it does not cover the simulation banner copy
- Header brand stays a 44px target at 320px under reduced motion
- Skip-nav clip-path restore keeps skip links 44px tall
- Playwright covers 320px focused skip-nav vs banner copy, 44px brand, and 44px skip links after clip restore

## Next

- Focused skip-nav should wrap skip links at 320px so it does not consume the full viewport height
- Terminal skip-nav in flow should not cover the topbar brand
- Skip-nav should return to its hidden state after skip-link activation
- Playwright: 320px skip-nav wrap, terminal brand not covered, skip-nav hides after activation
- Record a real Arbitrum Sepolia broadcast in the manifest (skipped this session: blocked on an approved deployer key; do not `--mark-deployed` without a tx)
- Redeploy the public Vercel UI after this PR merges (skipped this session: blocked on a Vercel deploy token; do not set `PHLEBAS_GATEWAY_URL` or `PHLEBAS_MATCHER_URL`)
- Public Vercel UI still serves the last merged production build until a deploy token is available

## Blockers

- None for this slice
- Mainnet remains a no-go: there is no production custody, reserve attester, mint controller, redemption service, identity/compliance tier, surveillance system, or independently audited deployment.
- The local JSON persistence added for testnet is intentionally single-process and is not the production authoritative ledger.
- Language bar still holds: never imply live, audited, trustless, private, shielded, or native-ZEC
- Vercel still must not hold spend keys, issue mainnet TEX, or run the authoritative matcher

## Done this batch (PR 22 + conditional lock)

PR 1 added the EVM half of the native-ZEC atomic swap. The contract is key-independent and remains undeployed.

- `docs/adr/0003-evm-conditional-lock.md` — design, hash function choice, claim/refund semantics, safety rails
- `contracts/src/swap/IConditionalLock.sol` — interface, error surface, event signatures
- `contracts/src/swap/ConditionalLock.sol` — non-upgradeable deposit, claim, refund, reentrancy guard, SHA-256 preimage check, pauser/governor roles
- `contracts/test/ConditionalLock.t.sol` — happy path, edge cases, double-claim, double-refund, wrong preimage, unauthorized claimant, paused-deposits-keep-refund
- `contracts/script/DeployConditionalLock.s.sol` — standalone Anvil/testnet deploy with role distinctness check
- `src/lib/conditional-lock-abi.ts` and `.test.ts` — pinned selectors (`deposit 7402f10a`, `claim 31d14457`, `refund 278ecde1`, `pause 8456cb59`, `unpause 3f4ba83a`) and event topics, plus calldata encoders
- `docs/THREAT_MODEL.md` — section 18 for the lock surface
- `contracts/README.md` — contract table and standalone deploy section
- 273 node tests pass, secret-pattern scan clean over 190 files, production build clean
- Foundry tests will run on GitHub Verify

## Done this batch (PR 23 + atomic swap state machine)

PR 2 added the deterministic state machine and the read-only `/swap` view. Both are key-independent. No signing surface ships in this PR.

- `docs/adr/0004-atomic-swap-state-machine.md` — leg-state model, transition rules, preimage primitive, read-only `/swap` route, signing boundary
- `src/lib/swap-state.ts` and `.test.ts` — pure state machine: `proposed`, `awaiting-zec-fund`, `awaiting-zec-claim`, `awaiting-evm-claim`, `settled`, `evm-refundable`, `zec-refundable`, `evm-refunded`, `zec-refunded`, `fully-refunded`, `disputed`. 24 unit tests cover happy path, claim after refund, refund after claim, double fund, deadline enforcement, and per-role `nextAction` dispatch
- `src/lib/preimage.ts` and `.test.ts` — browser preimage primitive: 32 random bytes from `crypto.getRandomValues`, SHA-256 hash via `crypto.subtle` (Node `node:crypto` fallback), `verifyPreimage` round-trip, malformed-input rejection. Pinned test vector covers a real SHA-256 of a known preimage
- `src/components/swap-state-panel.tsx` — client island: generate, display, paste-and-verify. No signing, no broadcast
- `src/app/swap/page.tsx` — server route at `/swap`, derives state from `fill`, `evm`, `zec`, `evmRefund`, `zecRefund`, `state`, `now`, `role` URL params. Noindex, simulation-frame layout, replay query
- 361 node tests pass, secret-pattern scan clean over 250 files, production build clean

## Done this batch (PR 24 + Zcash P2SH tx lab)

PR 3 added the ZEC half of the atomic swap. The address encoder, the
P2SH script builder, and the wallet adapter are all key-independent.
The signing surface stays gated. The browser path for `ripemd160` is a
follow-up because Web Crypto does not expose `ripemd160`.

- `docs/adr/0005-zcash-p2sh-atomic-swap.md` — design, hash function
  choice, P2SH script layout, wallet adapter seam, signing boundary
- `src/lib/ripemd160.ts` and `.test.ts` — thin Node-native wrapper,
  pinned against the canonical vectors that Node 24 reproduces
- `src/lib/sha256d.ts` and `.test.ts` — double SHA-256 wrapper for
  Base58Check
- `src/lib/base58check.ts` and `.test.ts` — Base58Check encoder and
  decoder with checksum validation
- `src/lib/zcash-script.ts` and `.test.ts` — op-code table, push
  encoders, concat helper
- `src/lib/zcash-pubkey.ts` and `.test.ts` — compressed secp256k1
  pubkey parser and encoder
- `src/lib/zcash-atomic-swap.ts` and `.test.ts` — claim branch, refund
  branch, full atomic-swap script, round-trip parser
- `src/lib/zcash-address.ts` and `.test.ts` — merged
  `inspectTransparentDestination` with the Base58Check address
  encoder and decoder; testnet and mainnet version bytes
- `src/lib/zcash-wallet-adapter.ts` and `.test.ts` — typed
  `buildFundTransaction`, `buildClaimTransaction`,
  `buildRefundTransaction`; `hashAtomicSwapParams` for the script
  hash
- `src/app/zcash/page.tsx` — server route at `/zcash`, noindex,
  simulation-frame layout, derives the script, address, and unsigned
  transactions from URL params, exposes the replay query
- `docs/THREAT_MODEL.md` — section 19 for the ZEC leg
- 425 node tests pass, secret-pattern scan clean, production build
  clean
