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

The suite checks `/`, `/trade`, `/liquidity`, `/legal`, and `/security` at 320, 390, 768, and 1440 CSS pixels, plus `/status`, a 404 route, first-session education (including Escape dismiss and a 320px dialog), country-blocked demonstration on trade and liquidity, landing journey tabs, evidence rows, a labeled Simulation terminal preview with fixture-named depth figures, six Not cleared mainnet gates, a JavaScript-disabled landing journey list, deposit and payout tours including an unresolved withdrawal demonstration that does not invent a payout, local matcher fills with a review-and-confirm step, Escape back from review, GTC cancel and epoch invalidation, IOC/FOK, G/I/F shortcuts including review-open ignore, and market-IOC outcomes, session expiry on review and the blotter log, past-expiry rejected panel, blotter tabpanels, LP review-and-confirm, LP pause-and-burn, LP IL-versus-hold preview, empty, loading, stale, and unavailable feed gates with withheld chart and 24h fixtures, a non-payable ZIP 321 placeholder QR and honest clipboard failure, venue comparison copy, testnet TEX issuance without a gateway, destination inspection, architecture incident demonstrations with a named selected-copy region, status incident-copy, a visible wallet-provider rejection, chart-range, LP-pool, terminal-view, ticket-group, gateway-journey, market, and feed-state arrow keys, skip links to the chart, order book, status ledger, legal article, security article, missing-route copy, architecture incident demonstration, liquidity pool tabs, pool stats, destination inspector, error retry copy, recent trades, and withheld-price loading notice, field-linked ticket and LP amount errors, later-listing copy on USDT review, fixture-labeled 24h volume, LP TVL, and preview depth, a named 44px ticket-keyboard region, 44px size percent shortcuts, 44px desktop review Back and ticket primary, 44px LP mint/swap/burn tour targets, 44px desktop market/feed tabs, wallet connect, chart range, ticket side, order-type, view tabs, blotter tabs, GTC, order-book price rows, Reset session, Cancel, Retry illustrative, tape rows, mid-price, fills, inventory, event-log, LP stats, chart empty, and order-book empty rows, a labeled render-failure demonstration, an allowlisted loading demonstration, 44px ticket notices, wallet rejection, and simulation disclosure banners, and Open Graph simulation metadata. Each width covers:

- Successful production-route responses and the expected simulation disclosure.
- Landing-to-liquidity navigation through the LP journey tab, and terminal view navigation.
- Keyboard activation of responsive navigation, terminal tabs, pool tabs, and the LP amount field.
- Skip-link visibility, focus styling, and focus transfer to the main landmark.
- Reduced-motion media handling with all required content still visible.
- Zero page-level horizontal overflow.
- Zero browser console errors, uncaught page errors, or Next.js error overlays.

Failure screenshots and traces are written to `test-results/`, which is ignored by Git.

## Limits

The automated suite uses Chromium. It does not replace manual assistive-technology review, Firefox and WebKit coverage, deployed Vercel verification, JavaScript-disabled review, or wallet interoperability testing. Those checks remain separate release gates. No test result authorizes testnet or mainnet activity.
