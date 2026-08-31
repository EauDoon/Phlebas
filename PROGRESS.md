# Phlebas progress

Read this first on every continue. Update it after every batch: done, next, blockers, branch.

Last updated: 31-08-2026 after native ZEC/USDC/USDT settlement labels. USDT0 abandoned.

## Branch

`feat/native-zec-usdc-usdt` stacked on `feat/simulation-hardening` (open PR #23 at `146069e`). Do not add commits to PR #22 or PR #23.

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
- Zebra observer and mint-attestation stubs: textest only, 10 confirmations, one outpoint one mint. No Zebra RPC. HTTP `/attest` is covered by a live loopback test.
- License: Apache License 2.0 (`LICENSE`, `docs/LICENSE_CHOICE.md`). Not MIT. Product language unchanged.
- Operator runbook for local Compose: `docs/OPERATOR_RUNBOOK.md`. Gateway, matcher, and observer health and incident steps. Loopback HTTP tests cover issue, sequence health, attest, quarantine, and disagreement.
- Public `/api/deposit-intent` and `/api/matcher` only proxy `http://127.0.0.1` (or localhost / `[::1]`) with no path. Anything else, including unset, is 503.
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
- LP panel previews integer IL versus holding the same deposited assets at 4x and 1/4x pZEC/quote, plus session IL after mint. Not a return projection.
- Gateway health publishes `issued` and `cap` from the shared `GATEWAY_DEFAULT_MAX_INTENTS` (64).
- Ticket and LP copy bind to version-1 fee constants (5 / 15 / 30 bps, max 30).
- Public `/status` shows intent cap `unset` when no loopback gateway URL is configured.
- Matcher health reports `persistReadable`. Observer health reports the 10-confirmation floor.
- Session ticket expiry is unix time or 0 for none. It binds the SHA-256 canonical encoding and the keccak typed order.
- Playwright covers market-IOC worst price, expiry on review, IL versus hold, and `/status` intent-cap `unset`.
- Ticket shows the next session nonce beside epoch. Invalid expiry keeps review closed.
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
- First-session education dialog on `/trade` and `/liquidity` (`phlebas.previewEducationVersion = 2026-08-30-1`). Education, not consent. Force with `?education=1`.
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

## Next

- Record a real Arbitrum Sepolia broadcast in the manifest (skipped this session: blocked on an approved deployer key; do not `--mark-deployed` without a tx)
- Redeploy the public Vercel UI after this PR merges (skipped this session: blocked on a Vercel deploy token; do not set `PHLEBAS_GATEWAY_URL` or `PHLEBAS_MATCHER_URL`)
- Public Vercel UI still serves the last merged production build until a deploy token is available
- Align first-session education with native pair labels without claiming live native-ZEC execution
- Ticket and LP review still say "pZEC is a custody receipt"; keep that honest or retarget to native-ZEC simulation copy
- Session encoding still uses `baseAsset: "pZEC"`; pin or retarget if the canonical order should name ZEC
- Undeployed contract sources still name `tUSDT0`; no-key rename is leftover, not a listing
- IL-versus-hold copy still says pZEC/quote
- Pin journeys spec against a later-listing-gate requirement as a listed state
- 320px landing native-pair cards: confirm no overflow after the USDT0 abandonment line

## Blockers

- None for this slice
- Language bar still holds: never imply live, audited, trustless, private, shielded, or live native-ZEC execution
- Vercel still must not hold spend keys, issue mainnet TEX, or run the authoritative matcher
