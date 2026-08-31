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

The suite checks `/`, `/trade`, `/liquidity`, `/legal`, and `/security` at 320, 390, 768, and 1440 CSS pixels, plus `/status`, a 404 route, first-session education (including Escape dismiss and a 320px dialog), country-blocked demonstration on trade and liquidity, landing journey tabs, evidence rows, a labeled Simulation terminal preview with fixture-named depth figures, six Not cleared mainnet gates, a JavaScript-disabled landing journey list, deposit and payout tours including an unresolved withdrawal demonstration that does not invent a payout, local matcher fills with a review-and-confirm step, Escape back from review, GTC cancel and epoch invalidation, IOC/FOK, G/I/F shortcuts including review-open ignore, and market-IOC outcomes, session expiry on review and the blotter log, past-expiry rejected panel, blotter tabpanels, LP review-and-confirm, LP pause-and-burn, LP IL-versus-hold preview, empty, loading, stale, and unavailable feed gates with withheld chart and 24h fixtures, a non-payable ZIP 321 placeholder QR and honest clipboard failure, venue comparison copy, testnet TEX issuance without a gateway, destination inspection, architecture incident demonstrations with a named selected-copy region, status incident-copy, a visible wallet-provider rejection, chart-range, LP-pool, terminal-view, ticket-group, gateway-journey, market, and feed-state arrow keys, skip links to the chart, order book, status ledger, legal article, security article, missing-route copy, architecture incident demonstration, liquidity pool tabs, pool stats, destination inspector, error retry copy, recent trades, and withheld-price loading notice, field-linked ticket and LP amount errors, later-listing copy on USDT review, fixture-labeled 24h volume, LP TVL, and preview depth, a named 44px ticket-keyboard region, 44px size percent shortcuts, 44px desktop review Back and ticket primary, 44px LP mint/swap/burn tour targets, 44px desktop market/feed tabs, wallet connect, chart range, ticket side, order-type, view tabs, blotter tabs, GTC, order-book price rows, Reset session, Cancel, Retry illustrative, tape rows, mid-price, fills, inventory, event-log, LP stats, chart empty, and order-book empty rows, a labeled render-failure demonstration, an allowlisted loading demonstration, 44px ticket notices, wallet rejection, and simulation disclosure banners, 44px ticket blocked, gate, country-block, and education copy, a country-block skip, 44px honesty bar, incident copy, and review custody notice, an honesty-bar skip, 44px privacy callouts, evidence rows, and layer cards, privacy and architecture-layer skips, 44px status, legal, and security ledger rows, 44px landing market cards and launch-gate rows, landing skip links in on-page order to markets, evidence, pZEC, terminal preview, journeys, and launch gates, 44px landing mobile menu links, a named current-system ledger, a named JavaScript-disabled journey list, 44px landing desktop nav and footer links, 44px pZEC flow steps, 44px simulation-frame and terminal footer links, named status, legal, and security ledgers, 44px landing header Enter simulation, journey tabs, pZEC ZIP 320 source link, and simulation-frame primary nav, 44px landing hero Enter simulation and Understand pZEC, Open status details, Read the launch gates, and simulation-frame and terminal brand home links, 44px landing market Preview market links, journey panel actions, no-JS journey card actions, and landing header brand, 44px status, legal, and security in-page links, landing skip links, Menu, and Close, 44px terminal and simulation-frame skip links, education Continue, and error Retry, 44px 404 skip and missing-route copy, loading skip and withheld-price notice, education Back, and education Enter simulation, 44px deposit and withdrawal tour buttons, retry copy, and country-block skip, 44px architecture, honesty-bar, layers, pool-tabs, pool-stats, destination-inspector, and privacy-callouts skip links, 44px trade skip links (ticket, chart, book, blotter, tape) and incident demonstration skip, 44px status, legal, and security skips with 12px skip-target scroll-margin on unhashed ids, 12px trade and landing skip-target scroll-margin, a 2px landing skip-link focus ring, 12px skip-nav inset so the skip-link focus ring fits, 12px pZEC, journeys, and launch-gates skip-margin, reduced-motion skip-nav without a slide, 8px landing overflow-clip margin, skip-nav above the simulation banner, terminal banner below skip-nav, reduced-motion skip-nav not covering the header brand at 320px until focused, skip links inside the 320px viewport, focused skip-nav in flow so it does not cover banner copy, 44px header brand at 320px, 44px skip links after clip restore, focused skip-nav wrap at 320px, terminal brand below in-flow skip-nav, skip-nav hidden after skip-link activation, and Open Graph simulation metadata. Each width covers:

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
