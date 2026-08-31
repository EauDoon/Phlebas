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

The suite checks `/`, `/trade`, `/liquidity`, `/legal`, and `/security` at 320, 390, 768, and 1440 CSS pixels, plus `/status`, a 404 route, first-session education (including Escape dismiss and a 320px dialog), country-blocked demonstration on trade and liquidity, landing journey tabs, evidence rows, a labeled Simulation terminal preview, six Not cleared mainnet gates, a JavaScript-disabled landing journey list, deposit and payout tours, local matcher fills with a review-and-confirm step, Escape back from review, GTC cancel and epoch invalidation, IOC/FOK, G/I/F shortcuts including review-open ignore, and market-IOC outcomes, session expiry on review and the blotter log, past-expiry rejected panel, blotter tabpanels, LP review-and-confirm, LP pause-and-burn, LP IL-versus-hold preview, empty, loading, stale, and unavailable feed gates with withheld chart and 24h fixtures, a non-payable ZIP 321 placeholder QR and honest clipboard failure, venue comparison copy, testnet TEX issuance without a gateway, destination inspection, architecture incident demonstrations, status incident-copy, and a visible wallet-provider rejection. Each width covers:

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
