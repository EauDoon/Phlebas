# Phlebas progress

Read this first on every continue. Update it after every batch: done, next, blockers, branch.

Last updated: 01-09-2026 while reconciling the hardened native-settlement stack with live `main` at `46a222ba4a92b5facb6a5adb35028a327c57e6a4`.

## Branch

Integration worktree: `feat/native-swap-state-machine` at `4b4e224`, merging live `main` at `46a222b`.

The committed native-settlement stack is 27 commits beyond its original base, which satisfies the requested minimum of eight meaningful commits and remains below the 100-commit PR cap. Do not publish the merge until conflicts are resolved, full checks pass, an independent exact-head review is clean, and a Vercel preview resolves to that exact head.

## Canonical authority

- `src/lib/swap-state.ts` and `src/lib/swap-journal.ts` are the only canonical native-settlement authority.
- The older `Fill` observer model is a legacy, untrusted, no-value diagnostic. It must not create a swap, recommend a wallet action, or substitute a lock ID for a signed swap ID.
- pZEC/tZEC receipt, gateway, reserve, custody, and AMM components remain legacy simulation or Testnet fixtures, not the production settlement target.
- Production remains on HOLD. No exact-merge-SHA Vercel success exists for current `main`; the latest attempt hit the Hobby deployment limit.

## Active integration batch

- Reconcile native settlement with live-main accessibility, market, service, and operations work.
- Preserve the signed ZEC-first SwapState and hash-chained journal as authority.
- Add the native settlement walkthrough to the shared terminal view model without exposing a wallet or broadcast surface.
- Replace public error details with fixed non-sensitive copy.
- Restack PR #26 after this integration. Do not merge its stale, conflicted head.
- Run the complete Node, Foundry, production-build, secret-scan, and Chromium gates on the resolved tree.

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
- No-value Arbitrum Sepolia contracts: tZEC, quote faucets, settlement, factory, pair, router. Typehashes match the TypeScript vectors. Undeployed.
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
- Fills, resting orders, and the tape name the settlement pair (`ZEC-USDC` / `ZEC-USDT`).
- Account epoch is visible on the ticket and blotter. Invalidate older session orders increments it.
- LP trading pause disables mint and swap; burn stays available.
- Wallet connect failures are visible. Gateway issue shows an issuing state.
- Review repeats assets, fees, custody, and public-linkability (PRODUCT_SPEC §10).
- Empty feed shows empty depth. Loading feed disables review.
- `/api/status` never copies a remote operator URL. `intentCap` is 64 only when the gateway URL is loopback HTTP. `sequenceRoot` stays null without a fetched loopback matcher.
- Blotter tables scroll inside the panel so the settlement column cannot blow the 320px page.
- LP panel previews integer IL versus holding the same deposited assets at 4x and 1/4x ZEC/quote, plus session IL after mint. Not a return projection.
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
- LP mint and swap use review-and-confirm repeating PRODUCT_SPEC §10 (assets, worst price, fees, custody, public-linkability). Burn stays immediate.
- Blotter tabs expose one tabpanel each, with arrow/Home/End keys.
- `/legal` and `/security` simulation pages. Landing, terminal, status, and frame nav cross-link them.
- Landing journey chooser is four manually activated tabs (Trader, LP, Deposit, Withdrawal). Without JS, all four descriptions stay in the document. Liquidity nav selects LP after hydration via `#journey-lp`.
- ZIP 321 deposit shows a non-payable placeholder QR. Clipboard failure copy does not claim a copy succeeded. Nothing is sent.
- Chart and 24h stats withhold fixtures on empty, loading, and unavailable feeds, and name a delayed series when stale.
- LP mint and swap stay off for loading, stale, and unavailable feeds. Burn stays available. Empty-book feed does not drain the pool.
- First-session education dialog on `/trade` and `/liquidity` (`phlebas.previewEducationVersion = 2026-08-31-1`). Education, not consent. Force with `?education=1`.
- Country-blocked state demonstration via allowlisted `?access=blocked`. Never infers location.
- Chart range is a tablist. Depth and tape name loading and unavailable feeds, not only empty.
- Landing Liquidity nav selects `#journey-lp`. Journey tabs use manual activation: arrows move focus, Enter selects.
- Ticket keyboard G/I/F sets time in force. Escape leaves review. Shortcuts ignore an open dialog.
- Architecture labeled incident demonstrations: blocked, review, reorg, planned and unplanned maintenance. Copy is a demonstration, not a live outage.
- Deposit tour walks Eligibility through Complete. Address request never shows a receivable address, QR, or URI.
- Education dialog Continue and the incident select stay at least 44px tall at 320px.
- `/status` and `/api/status` name incidents as `architecture-demonstration`. The page links to Architecture and says the copy is not a live outage.
- Ticket G/I/F stay locked during review-and-confirm. Escape still leaves review.
- Empty session LP shares name the selected pool (`ZEC/USDC` or `ZEC/USDT`) and are not an order-book empty notice. The notice clears after a mint.
- `/status` Architecture link uses allowlisted `demo=incidents` and keeps the `architecture-demonstration` label on the incident panel. Switching the Architecture market keeps `demo=incidents` in the URL.
- Blotter empty orders and empty fills name the settlement pair (`ZEC-USDC` or `ZEC-USDT`).
- Blotter empty event log names the settlement pair (`ZEC-USDC` or `ZEC-USDT`). Replay copy stays honest.
- Leaving Architecture for Trade, Liquidity, or the ZEC gateway drops `demo=incidents` from the URL. Returning to Architecture restores it from tab session storage (`phlebas.incidentDemo`). A new tab or a refresh without the query starts without the highlight.
- Filled blotter event-log submit and cancel rows name the event market's settlement pair. Reset stays session-wide. The log caption names the current market.
- Ticket reject copy (`ticketRejectCopy` / `describeSubmit`) names the settlement pair on matcher reject, inventory, self-trade, and expiry. Retry stays safe.
- Depth empty copy, withheld tape, withheld chart, and the order-book caption name `ZEC-USDC` or `ZEC-USDT`.
- Ticket empty-book gate uses `emptyBookGateCopy` and names the settlement pair the way depth empty copy does. Review stays disabled.
- 24h stats withheld copy uses `feedWithheldCopy` and names the settlement pair.
- Depth mid-price row names the settlement pair next to session last.
- Ticket loading, stale, and unavailable gates use `ticketGateCopy` and name the settlement pair the way the empty-book gate does.
- Withheld tape caption names the settlement pair and does not claim fixture fills appear. The tape mini-label is `Withheld · ZEC-USDC` when fixtures are off.
- Session-last 24h stats label names the settlement pair when fixtures are shown.
- Chart range tab accessible names include the settlement pair (`4H · ZEC-USDC`). Visible labels stay 1H/4H/1D so 320px does not overflow.
- Wallet connect-failure copy (`missingProviderCopy` / `walletConnectFailureCopy`) names the settlement pair. Still Arbitrum Sepolia only. Nothing is sent.
- LP pause and resume notices name the selected market settlement pair. Burn stays available while paused.
- Chart panel heading accessible name is `ZEC/USDC · ZEC-USDC`. The eyebrow names the settlement pair. Visible h2 stays the market id so 320px does not overflow.
- Wrong-chain wallet state from `connectTestnetWallet` is wrapped with `walletStateWithSettlement` before it reaches the bar.
- LP reset-pool notice names the selected market settlement pair.
- Price chart aria-label and SVG title use `priceChartLabelCopy` and name the settlement pair from real market state.
- Wallet disconnect control accessible name uses `walletDisconnectLabel` and names the settlement pair.
- LP mint success notice uses `lpMintNoticeCopy` and names the settlement pair.
- LP burn success notice uses `lpBurnNoticeCopy` from a real mint-then-burn and names the settlement pair. Local preview only.
- Idle wallet connect title uses `walletConnectIdleTitle` and names the settlement pair.
- After Retry illustrative from a withheld feed, the price chart img uses `priceChartLabelCopy` again.
- LP swap success notice uses `lpSwapNoticeCopy` from a real mint-then-swap and names the settlement pair. Local preview only.
- Connecting wallet title uses `walletConnectBusyTitle` and keeps the settlement pair while the injected provider is pending.
- After Retry illustrative, chart 1H and 1D img labels use `priceChartLabelCopy` for the selected range.
- LP swap success on the USDT pool uses `lpSwapNoticeCopy` from a real mint-then-swap on `pools[1]` and names `ZEC-USDT`. Local preview only.
- Connecting wallet title uses `walletConnectTitle` and keeps the settlement pair after switching market while the injected provider is pending.
- After Retry illustrative on ZEC/USDT, chart 1H and 1D img labels use `priceChartLabelCopy` for `ZEC-USDT`.
- Idle wallet connect title uses `walletConnectIdleTitle` and keeps the settlement pair after switching market.
- LP mint success on the USDT pool uses `lpMintNoticeCopy` from a real mint on `pools[1]` and names `ZEC-USDT`. Wallet actions stay disabled.
- After switching to ZEC/USDT with the feed unavailable, withheld chart and 24h stats copy uses `feedWithheldCopy` and names `ZEC-USDT` before Retry illustrative.
- Missing-provider copy after switching market then clicking connect names `ZEC-USDT`.
- Wallet disconnect accessible name after switching market keeps the settlement pair. Stub is Arbitrum Sepolia only. Nothing is sent.
- LP pause notice on the USDT pool uses `lpPauseNoticeCopy` from `pools[1]` and names `ZEC-USDT`. Burn stays available.
- LP burn success on USDT uses `lpBurnNoticeCopy` from a real mint-then-burn and names `ZEC-USDT`. Local preview only.
- LP reset-pool notice on USDT uses `lpResetNoticeCopy` from a real mint then restore and names `ZEC-USDT`.
- LP pause notice names the newly selected pool if trading stays paused after a pool switch. Derived from `lpPauseNoticeCopy` when `isLpPauseNotice`; mint/burn/swap notices stay on the pool they ran on.
- LP lifted pause notice names the newly selected pool if resume is not clicked after a pool switch while already lifted. Derived from `lpPauseNoticeCopy` whenever `isLpPauseNotice`; mint/burn/swap notices stay on the pool they ran on.
- Ticket sign missing-provider copy uses `missingProviderCopy` with the selected market settlement pair. Wallet can stay connected after the provider is gone. Nothing is sent.
- Missing-provider error uses `retargetSettlementCopy` so a failed connect keeps the current settlement pair after a market switch without clicking Connect again.
- Ticket sign missing-provider copy names `ZEC-USDT` if the market switches while review is still open. `TradeTicket` stays mounted across a market switch (`key={feedStatus}`); `isMissingProviderCopy` retargets the live notice. Nothing is sent.
- Rejected-connect failure copy (`walletConnectFailureCopy`, not missing-provider) retargets settlement after a market switch without clicking Connect again.
- Chart withheld copy retargets if the market switches while the feed stays unavailable. `PriceChart` already calls `feedWithheldCopy` with the current market's settlement pair. No Retry.
- Ticket reject copy uses `retargetSettlementCopy` so a market switch while the rejected panel is open names the new settlement pair. Real FOK miss plus unix-expiry Playwright. Retry is safe; nothing was submitted.
- Connecting wallet title uses `walletConnectBarTitle` so a hanging provider after a prior reject keeps settlement if the market switches. Prior reject stays in the status span.
- Settlement pairs are `ZEC-USDC` and `ZEC-USDT`. Quotes are native USDC and native USDT. USDT0 is abandoned.
- Later-listing-gate copy is removed from the ticket, LP panel, and terminal.
- Landing, architecture panel, layout, and security copy name native ZEC against native USDC and native USDT.
- ADR 0002 records the pair-label change. ADR 0001 keeps Arbitrum One and custody-backed pZEC as the ERC-20 form.
- Session inventory reject copy names ZEC, not pZEC. LP burn and swap notices name ZEC.
- Product spec, README, SECURITY, threat model, architecture, landing journeys, launch plan, legal, and accounting no longer list USDT0 as a quote.
- First-session education version `2026-08-31-1` names native ZEC against USDC and USDT and says it is not live settlement.
- Session canonical encoding uses `baseAsset: "ZEC"`.
- Ticket, LP, and gateway review say the preview labels native ZEC and is not live settlement.
- IL-versus-hold labels are `4x ZEC/quote` and `1/4x ZEC/quote`.
- Undeployed quote faucet is `tUSDT`. Solidity `usdt0` storage is `usdt`. Receipt symbol is `tZEC`.
- Landing CTA is `Understand native pairs` and hashes `#pairs`.
- Deposit-tour complete copy: nothing was minted. No pZEC in the tour bodies.
- Session inventory fields are `zecAtoms` / `reservedZecAtoms` / `availableZec`.
- Frozen SHA-256 for the sample `baseAsset=ZEC` order is `2d3360d350d50a83e69a46f50a4fedcfc77a610dc91fe0d80fee67616acb38ca`.
- Blotter, ticket, LP amount, and depth caption name ZEC, not pZEC.
- Undeployed receipt symbol is `tZEC`. Solidity type is `Zec`. Factory, settlement, pair, and router expose `zec`.
- LP, AMM, and router use `reserveZecAtoms`.
- Gateway heading is `ZEC gateway`. Incident mint copy does not name pZEC.
- Units helper is `ZEC_DECIMALS`. Market-data helper is `zecAtomsFromHundredths`. TESTNET key is `zec`.
- Pair LP token symbol is `tLP`. Session buy-fill test title credits ZEC.
- Matcher `sizeAtoms` stay generic and mean 8-decimal ZEC atoms.
- ARCHITECTURE and ASSET_AND_ACCOUNTING list `tZEC` as the undeployed receipt, not custody-backed pZEC as the candidate ERC-20 form. ADR 0001 stays historical.
- Copy-boundary tests fail if those docs revert to listed pZEC.
- PRODUCT_SPEC roles, LP warnings, gateway, and §10 confirmations name tZEC / ZEC custody, not pZEC.
- Ticket and LP high-risk review surface `custodyRedemptionCopy` and `publicLinkabilityCopy`.
- Landing pairs copy no longer says it wraps ZEC as pZEC. Native labels are simulation names, not live settlement.
- Landing CSS classes are `pairsSection` / `pairsCopy`.
- ADR 0002 lists `tZEC` as the undeployed receipt. Custody-backed pZEC is no longer the candidate ERC-20 claim.
- LANDING_AND_USER_JOURNEYS, THREAT_MODEL, LAUNCH_PLAN, LEGAL, OPERATIONS, DELIVERY_PLAN, WALLET_COMPATIBILITY, and README no longer list pZEC as the current form.
- `lpBurnNoticeCopy` takes `zecLabel`. LP IL math uses `lpZecAtoms`. Preview helpers are `ZEC_ATOMIC_RULE` / `formatZecPreviewAmount`. Foundry locals are `reserveZec`.
- Ticket market orders show `marketOrderConstraintCopy`. A 0% slippage IOC buy at lastTicks does not fill the 52.91 ask. Playwright covers that at 320px.
- LP risk copy is `lpRiskCopy` and names toxic flow and emergency restrictions.
- Buy/Sell selected state is `sideControlCopy` text plus underline, not color alone. Playwright at 320px.
- Gateway empty/error copy is `gatewayOffCopy` / `gatewayUnavailableCopy`. 320px Issue retry stays non-receivable.
- LP empty shares, toxic-flow risk, unavailable mint/swap, and Retry illustrative are covered at 320px.
- Ticket B/S keyboard shortcuts are unit-tested and covered at 320px (`shortcuts-320.spec.ts`).
- Book Bid/Ask buttons use visible `bookSideControlCopy` (`Ask 52.91` / `Bid 52.78`), not `.srOnly`.
- Withdrawal tour includes Rejected (pre-burn) and Unresolved (after mined). 320px Playwright walks both. Nothing is sent.
- LP `feed=loading` and `feed=stale` disable mint/swap, leave burn on, and Retry illustrative is covered at 320px.
- Tape Buy/Sell is visible `tapeSideCopy` text in the price cell, not `.srOnly`. Playwright at 320px.
- Withdrawal tour includes Expired evidence after burn submitted (`closed` without a finalized burn). 320px Playwright. Nothing is sent.
- Ticket `feed=loading`, `feed=stale`, and `feed=empty` gates plus Retry illustrative are dedicated 320px specs.
- Ticket `/trade?feed=unavailable` disables review at 320px and Retry illustrative re-enables it.
- Deposit tour includes Unavailable, Rejected, and Stale fail-closed steps. Nothing is minted. 320px Playwright.
- LANDING_AND_USER_JOURNEYS withdrawal machine includes expired evidence and closed without a finalized burn.
- Architecture incident demo includes observer disagreement. Copy is architecture-demonstration, not a live outage. 320px Playwright.
- Withdrawal tour includes Refunded (tZEC restored on unrecoverable pre-signature failure). `refundPayoutBeforeSignature` refuses after signed. 320px Playwright. Nothing is sent.
- LANDING_AND_USER_JOURNEYS withdrawal machine includes tZEC restored / refunded.
- 320px USDT ticket reject panel (FOK miss and past expiry) names ZEC-USDT.
- `payoutClaimForTourStep` walks `transaction_prepared`, `signed`, `broadcast`, `mined`, and `confirmed` as real states.
- Withdrawal tour includes Observed recovery and Inputs restored. 320px Playwright. Nothing is sent.
- LANDING_AND_USER_JOURNEYS includes unresolved recovery and deposit fail-closed Unavailable, Rejected, and Stale.
- `refundWithdrawalBeforeSignature` restores tZEC supply from a payable reserve snapshot and refuses signed claims. Unit test starts from `burnedState`.
- Gateway stub uses `payoutClaimStubCopy(tourClaim)` so later happy-path ids show `signed`/`broadcast`/`mined`/`confirmed`, not collapsed payable.
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
- Focused skip-nav wraps skip links two-up at 320px so it does not consume the full viewport height
- Terminal skip-nav in flow does not cover the topbar brand
- Skip-nav returns to its clipped hidden state after skip-link activation
- Playwright covers 320px skip-nav wrap, terminal brand below skip-nav, and hide after skip
- Skip-link `:focus-visible` keeps the 2px `#15140d` ring for keyboard focus
- Two-up skip links stay 44px tall when the label wraps at 320px
- Focused skip-nav stays inside the 320px viewport (`max-width: 100%`)
- Skip-nav focused padding is 4px so the 2px ring plus offset stays inside overflow-y auto
- Hidden reduced-motion skip-nav zeros padding and gap and sets `transition: none` so hide restores a 1px clip box
- Playwright covers focus-visible wrap height, 320px overflow, unclipped ring, and hide after skip
- Skip-link wrapped labels use `line-height: 1.3` at 320px
- Skip-nav height cap uses 6px padding so the 2px ring plus offset is not clipped vertically
- A later `max-width: 820px` rule keeps `overflow-y: auto` after reduced-motion `overflow: visible`
- Skip-nav `scrollbar-gutter: stable` keeps two-up skip links at least 44px
- Focused skip-nav at 390px is `width: 100%` two-up with the 2px ring inside the viewport
- `a.skipLink:focus-visible` keeps outline `#15140d` against global `a:focus-visible`
- Overflow-y auto without reduced-motion still contains the skip-link ring
- Focused skip-nav stays in flow (`position: relative; inset auto`) so it does not cover the landing header after wrap
- Playwright covers wrapped line-height, vertical ring, gutter, 390px two-up, focus-visible color, motion overflow-y auto, and header clearance
- Two-up skip-link labels use `overflow-wrap: anywhere` so width stays at least 44px
- Focused skip-nav stays two-up at 768px (`flex-direction: row; flex-wrap: wrap`) with the 2px ring inside the viewport
- Skip-nav `column-gap` / `row-gap` 4px plus `max-width: calc(50% - 2px)` keeps two-up links inside the guttered nav
- A wrapped two-up pair uses `align-items: stretch` so both links share the same row height
- Focused skip-nav `z-index: auto` at 820px so it does not cover the landing Menu button
- Terminal skip-nav at 390px stays two-up with the 2px ring inside the viewport
- Playwright covers 768px two-up, overflow-wrap, gutter max-width, stretched row height, Menu clearance, and terminal 390px two-up
- Skip-nav `row-gap: 8px` so 2px rings plus offset do not clip between wrapped rows
- Two-up skip-link `padding: 8px` and `box-sizing: border-box` keep overflow-wrap labels inside the 44px target
- Two-up skip links use `flex: 1 0` so a leftover odd link stays at least 44px
- Focused skip-nav `z-index: 1` at 820px so skip links stay above the simulation banner
- Focused skip-nav at 768px does not cover the landing header brand
- Terminal skip-nav at 768px stays two-up with the 2px ring inside the viewport
- Simulation-frame skip-nav on `/legal` and `/security` stays two-up at 320px
- Playwright covers row-gap rings, leftover 44px, 768px brand, terminal 768 two-up, legal/security two-up, and banner stacking
- Skip-nav `column-gap: 8px` so 2px rings plus offset do not overlap two-up neighbors
- Two-up skip links use `flex: 1 0 calc(50% - 4px)` to match the 8px column-gap
- Two-up skip links use `word-break: break-word` so overflow-wrap stays inside the cell
- `/status` skip-nav stays two-up at 320px
- Liquidity leftover skip link (three links) stays at least 44px at 320px
- Skip-link 8px padding still leaves a 44px min-height
- Focused skip-nav at 768px does not cover the landing Menu button
- Focused skip-nav z-index 1 does not cover the landing header after wrap at 320px
- Playwright covers column-gap rings, status two-up, liquidity leftover, 768px Menu, 320px header, and security wrap
- Two-up skip links use `flex: 1 1` so 8px column-gap plus scrollbar-gutter still leaves 44px at 320px
- Focused skip-nav `min-width: 0` so the guttered nav can shrink
- Two-up `max-width: min(100%, calc(50% - 4px))` keeps word-break inside the 44px cell
- 404 and loading skip-nav stay two-up at 320px
- Bridge leftover skip link (three links) stays at least 44px at 320px
- Architecture skip-nav at 320px stays two-up with the 2px ring inside the viewport
- Status skip-nav at 768px stays two-up with the 2px ring inside the viewport
- Playwright covers gutter 44px, 404/loading two-up, bridge leftover, architecture 320 ring, status 768, and word-break overflow
- Trailing `max-width: 820px` skip-link rule keeps `min-width`/`min-height` 44px after skip-nav `min-width: 0`
- Trailing skip-link `flex: 1 1 calc(50% - 4px)` keeps two-up after reduced-motion
- Error-page skip-nav stays two-up at 320px
- Country-block skip-nav stays two-up at 320px
- Architecture skip links stay at least 44px at 390px
- Loading, 404, and bridge skip-nav stay two-up at 768px with the 2px ring inside the viewport
- Playwright covers error and country-block two-up, architecture 390 leftover, and 768 loading/404/bridge two-up
- Trailing skip-link `max-width: min(100%, calc(50% - 4px))` and `box-sizing: border-box` keep two-up plus 8px gap inside 320px
- Global-error skip-nav has Skip to main content and Skip to retry copy, two-up, with a `#15140d` focus-visible ring
- Global-error Retry stays 44px
- Legal skip links stay at least 44px at 390px
- Liquidity, country-block, architecture, and error skip-nav stay two-up at 768px with the 2px ring inside the viewport
- Playwright covers 768 liquidity/country-block/architecture/error two-up, legal leftover at 390px, and 320 trailing overflow
- Trailing skip-nav `padding: 8px` keeps the 2px ring inside overflow-y auto
- Education dialog `margin-top: min(40vh, 17.5rem)` at 820px so it stays below skip-nav
- Education waits to `showModal` while skip-nav is `:focus-within`
- Security and status leftover skip links stay at least 44px at 390px
- Liquidity leftover skip link stays at least 44px at 768px
- Bridge leftover skip link stays at least 44px at 390px
- Global-error skip-nav is two-up at every width, including 768px
- Playwright covers leftover 44px, education clearance, and overflow-y ring padding
- Education dialog `max-height: calc(100vh - min(40vh, 17.5rem) - 12px)` and `overflow-y: auto` keep Continue inside 320px
- Education `.tourNav` is sticky at the bottom of the 320px dialog
- Security and status leftover skip links stay at least 44px at 768px
- Country-block, 404, and loading leftover skip links stay at least 44px at 390px
- First and trailing 820px skip-nav padding is 8px so two-up links stay 44px at 320px after the gutter
- Playwright covers education Continue in 320px, leftover 44px, and 8px padding two-up
- Education dialog `scroll-padding-top/bottom: 8px` and heading `scroll-margin-top: 8px` keep the 2px ring inside max-height
- Education Back stays inside the 320px viewport with sticky tourNav
- Education Enter simulation stays 44px (`flex-shrink: 0`) after skip-nav margin-top
- Legal leftover skip link stays at least 44px at 768px
- Architecture leftover skip links stay at least 44px at 768px
- Error-page leftover skip link stays at least 44px at 390px
- Skip-nav 8px padding keeps the 2px ring inside overflow-y auto at 768px
- Playwright covers education Back, Enter simulation, heading ring, leftover 768/390, and skip-nav ring at 768px
- Education Back stays 44px when disabled on the first step
- Education copy has 52px padding-bottom at 820px so sticky tourNav does not cover it
- Education Continue `:focus-visible` is a 2px ring; tourNav padding keeps it inside overflow-y auto
- Liquidity leftover skip link stays at least 44px at 390px
- Bridge and country-block leftover skip links stay at least 44px at 768px
- Skip-nav 8px padding keeps the 2px ring inside overflow-y auto at 390px
- Playwright covers disabled Back, sticky copy clearance, Continue ring, leftover 390/768, and skip-nav ring at 390px
- Education dialog is a column at 820px; tourNav `margin-top: auto` keeps Enter simulation in the 320px viewport
- Education copy padding-bottom is 8px so Continue is not pushed below 320px
- Education Continue ring is `#f4c95d` against global `button:focus-visible`
- Status and security leftover skip links stay at least 44px at 320px
- Loading and 404 leftover skip links stay at least 44px at 768px
- Playwright covers Enter simulation in 320px, Continue `#f4c95d`, and leftover 320/768

## Next

- Bind matcher receipts and complete signed-order witnesses into exact `SwapTermsV1`, swap IDs, terms hashes, integer quote amounts, and the zero-fee invariant.
- Add `swapId` and `termsHash` to the EVM lock contract and verified event surface, then regenerate ABI tests. USDT remains disabled until one exact network and token contract are approved.
- Replace heuristic Zcash spend classification with exact transaction, branch, witness, and preimage decoding. Pin the SHA-256 to HASH160 commitment vector.
- Replace legacy observer transitions and v1 Fill snapshots with exact evidence adapters and a verified journal/snapshot store.
- Complete Testnet wallet interoperability, recovery, reorganization, and wrong-network scenarios without embedding keys.
- Restack and re-review PR #26 against the integrated native-settlement tree.
- Create an exact-head Vercel preview after the deployment quota permits it. Promote only a release-approved artifact.

## Blockers

- No blocker prevents local development, review, or Testnet-safe verification.
- Mainnet remains a no-go until the contract, wallet, observer, matcher-to-terms, legal, operations, audit, and capped rollout gates have current evidence.
- Vercel must never hold spend keys, node credentials, authoritative journals, or signing and broadcast services.
- The language bar still holds: never imply live, audited, trustless, private, shielded, or production-ready execution.
- Real deployment and broadcast remain gated on exact approved keys and exact reviewed artifacts. Missing keys do not block key-independent development.

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
