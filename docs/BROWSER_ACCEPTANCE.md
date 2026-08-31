# Browser acceptance

Phlebas uses a locked Playwright test suite against the production Next.js build. It covers the public no-value simulation only. The checks do not connect a wallet, call a chain, accept funds, or qualify any Zcash wallet.

## Run locally

Use Node.js 24.x and npm.

```bash
npm ci --ignore-scripts
npx playwright install chromium
npm run check:browser
```

`check:browser` runs lint, TypeScript checks, unit tests, the production build, and the Chromium acceptance suite. The test fixture starts the production Next.js application on `127.0.0.1` with an OS-assigned free port and stops it after the run. It uses an explicit temporary browser profile under `test-results/` and removes the profile when the worker closes.

Linux CI installs the required system packages with `npx playwright install --with-deps chromium` before running the same command.

## Covered behavior

The suite checks `/`, `/trade`, and `/liquidity` at 320, 390, 768, and 1440 CSS pixels, plus `/status`, `/legal`, `/security`, a 404 route, `/api/status` incidents, the `/status` Architecture demonstration link, Architecture market switch keeping `demo=incidents`, Architecture→Trade, Liquidity, and ZEC gateway dropping `demo=incidents` and restoring it on return from tab session storage, filled blotter event-log rows naming the settlement pair, ticket reject copy naming the settlement pair on FOK and expiry, ticket reject copy naming pZEC-USDT0 if the market switches while the rejected panel is open, connecting wallet title after a rejected connect hang keeping settlement, chart withheld copy naming pZEC-USDT0 if the market switches while unavailable, depth and tape empty copy naming the settlement pair, withheld chart naming the settlement pair, empty-book ticket gate naming the settlement pair, 24h stats withheld copy naming the settlement pair, depth session last naming the settlement pair, loading/stale/unavailable ticket gates naming the settlement pair, withheld tape caption and mini-label naming the settlement pair, session-last stats label naming the settlement pair when fixtures are shown, chart range tab accessible names including the settlement pair, wallet connect-failure copy naming the settlement pair, missing-provider copy naming pZEC-USDT0 after a market switch, missing-provider error keeping settlement after a market switch without a second click, ticket sign missing-provider copy naming the selected market settlement pair, ticket sign missing-provider copy naming pZEC-USDT0 if the market switches while review is open, rejected-connect failure copy retargeting settlement after a market switch, LP lifted pause notice naming the newly selected pool after a pool switch, disconnect accessible name keeping settlement after a market switch, LP pause notice naming pZEC-USDT0 on the USDT0 pool, LP pause notice naming the newly selected pool after a pool switch while paused, LP lifted pause notice naming the newly selected pool after a pool switch while already lifted, LP burn success notice naming pZEC-USDT0 on the USDT0 pool, LP reset-pool notice naming pZEC-USDT0 on the USDT0 pool, LP pause notice naming the settlement pair, chart panel heading naming the settlement pair, LP reset-pool notice naming the settlement pair, price-chart aria-label naming the settlement pair, LP mint success notice naming the settlement pair, LP mint success notice naming pZEC-USDT0 on the USDT0 pool, LP burn success notice naming the settlement pair, idle wallet connect title naming the settlement pair, idle wallet connect title keeping settlement after a market switch, connecting wallet title keeping the settlement pair, connecting wallet title keeping settlement after a market switch, chart fixtures returning from withheld with priceChartLabelCopy, chart 1H/1D img labels after fixtures return, chart 1H/1D img labels after fixtures return on ZEC/USDT, withheld chart copy naming pZEC-USDT0 on ZEC/USDT before retry, chart withheld copy naming pZEC-USDT0 if the market switches while the feed stays unavailable, LP swap success notice naming the settlement pair, LP swap success notice naming pZEC-USDT0 on the USDT0 pool, landing journey tabs with manual keyboard activation, first-session education, country-block demonstration, ticket G/I/F shortcuts that ignore an open dialog and review-and-confirm, architecture incident demonstrations, deposit Eligibility-through-Complete tour, 320px education and incident touch targets, status incident copy, pool-named empty LP shares that clear after mint, blotter empty copy naming the settlement pair on orders, fills, and the event log, local matcher fills with a review-and-confirm step, GTC cancel and epoch invalidation, IOC/FOK and market-IOC outcomes, session expiry on review, past-expiry rejected panel, blotter event-log expiry, blotter tabpanels and arrow keys, chart range tablist, LP mint review-and-confirm, LP pause-and-burn, LP IL-versus-hold preview, payout-tour stub claims, empty and loading feeds, stale and unavailable feed gating for ticket, chart, 24h stats, depth, tape, and LP mint, venue comparison copy, ZIP 321 placeholder QR, honest clipboard failure, testnet TEX issuance without a gateway, destination inspection, and a visible wallet-provider rejection. Each width covers:

- Successful production-route responses and the expected simulation disclosure.
- Landing-to-liquidity navigation and terminal view navigation.
- Keyboard activation of responsive navigation, terminal tabs, pool tabs, and the LP amount field.
- Skip-link visibility, focus styling, and focus transfer to the main landmark.
- Reduced-motion media handling with all required content still visible.
- Zero page-level horizontal overflow.
- Zero browser console errors, uncaught page errors, or Next.js error overlays.

Failure screenshots and traces are written to `test-results/`, which is ignored by Git.

## Limits

The automated suite uses Chromium. It does not replace manual assistive-technology review, Firefox and WebKit coverage, deployed Vercel verification, JavaScript-disabled review, or wallet interoperability testing. Those checks remain separate release gates. No test result authorizes testnet or mainnet activity.
