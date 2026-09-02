# Browser acceptance

Phlebas runs its locked Playwright suite against the production Next.js build. The browser checks cover the public no-value simulation. They do not connect a wallet, call a chain, accept funds, qualify a Zcash wallet, or authorize deployment.

## Run locally

Use Node.js 24.x and npm.

```bash
npm ci --ignore-scripts
npx playwright install chromium
npm run check:browser
```

`check:browser` runs lint, TypeScript checks, unit tests, the production build, and Chromium acceptance tests. The fixture starts the built application on `127.0.0.1` with an OS-assigned port and stops it after the run. Temporary browser profiles and failure artifacts are written under `test-results/`, which is ignored by Git.

Run the whole gate, not `test:browser` on its own. The fixture calls
`next({ dev: false })`, so it serves whatever is already in `.next` and
never compiles anything itself. Running `test:browser` after editing a
component tests the previous build: the run is green or red for code that
is no longer on disk, which is worse than not running it. `check:browser`
ends its `check` half with the build for this reason.

Linux CI installs Chromium and its required system packages before running the same gate.

## Native settlement coverage

The native-settlement tests cover:

- `/trade?view=settlement&market=ZEC/USDC`.
- Deterministic happy-path and refund walkthroughs.
- Observer disagreement, reorganization, and contract-mismatch states that disable progression.
- The unresolved ZEC/USDT listing gate, which exposes no fixture funding action.
- Keyboard navigation through Trade, Settlement, and Liquidity tabs.
- Focus transfer from the settlement skip link to the walkthrough heading.
- 320px layout and touch-target behavior.
- The absence of wallet connection, signing, RPC, service, and broadcast controls.
- Successful production-route responses and the expected simulation disclosure.
- Landing-to-liquidity navigation through the LP journey tab, and terminal view navigation.
- Keyboard activation of responsive navigation, terminal tabs, pool tabs, and the LP amount field.
- Skip-link visibility, focus styling, and focus transfer to the main landmark.
- Reduced-motion media handling with all required content still visible.
- Zero page-level horizontal overflow.
- Zero browser console errors, uncaught page errors, or Next.js error overlays.
- Education last-step Back inside the 320px viewport.
- Education heading ring above the sticky tour navigation and inside the dialog overflow area.
- Legal, architecture, and country-block leftover skip links at least 44px at 320px.
- Error-page leftover skip link at least 44px at 768px.
- Education Enter/Back, heading-ring, and leftover skip-link coverage through 1440px.

These checks establish only the behavior of the no-value fixture. They do not validate the native-settlement authority, contract deployment, observer correctness, cross-chain commitments, or wallet interoperability.

## Simulation coverage

The broader matrix exercises `/`, `/trade`, `/liquidity`, `/status`, `/legal`, `/security`, error routes, and status APIs at 320, 390, 768, and 1440 CSS pixels. It covers:

- Honest simulation and legacy-surface disclosures.
- Landing navigation, native-pair cards, journey tabs, evidence, and launch gates.
- Order ticket, order-book, chart, blotter, matcher, gateway, payout, and liquidity fixtures.
- Empty, loading, stale, unavailable, country-blocked, and render-failure states.
- Keyboard operation, skip links, visible focus, 44px targets, reduced motion, and narrow-layout overflow.
- Market-specific copy, review and confirm steps, cancellation, expiry, IOC/FOK behavior, and fixture-only LP flows.
- Runtime errors, console errors, Next.js overlays, and production-route responses.

Tests covering the gateway, reserve, payout, AMM, and older deposit or withdrawal journeys exercise legacy simulations or testnet fixtures only. They are not evidence that native ZEC settlement is live.

## Limits

The automated suite uses Chromium. It does not replace manual assistive-technology review, Firefox and WebKit coverage, deployed Vercel verification, JavaScript-disabled review, contract audit, chain observation, or wallet interoperability testing. Those remain separate fail-closed release gates. No browser result authorizes testnet or mainnet activity.
