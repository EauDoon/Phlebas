# Accessibility SLO

This SLO defines the targets and the measurement procedure for the accessibility surface of the public Phlebas application. The targets apply to the deployed preview, the public Vercel simulation, and every CI run.

## Targets

| Indicator | Target | Measurement |
| --- | --- | --- |
| Skip-nav wraps at 320px without consuming the full viewport | 100% of previews | Playwright Chromium at 320 / 390 / 768 / 1440 CSS pixels |
| Skip-nav stays hidden after a skip link is activated | 100% of previews | `data-skip-nav-state` reaches `hidden-after-activation` after click on /status and /trade |
| Skip-nav returns to `visible` on the next focusin | 100% of previews | focusin handler re-asserts `data-skip-nav-state="visible"` after `hidden-after-activation` |
| Skip-nav returns to `hidden-after-activation` on Escape after activation | 100% of previews | keydown handler catches `Escape` and re-asserts `hidden-after-activation` |
| 44px tap targets on desktop buttons, links, inputs | 100% of previews | `min-width: 44px` and `min-height: 44px` enforced in the component CSS |
| Skip-link focus ring is not clipped | 100% of previews | `outline` is inside the parent nav box at every viewport |
| Zero browser console errors on the public routes | 100% of previews | `page.on("console", ...)` listener in Playwright |
| Zero page-level horizontal overflow | 100% of previews | `document.documentElement.scrollWidth <= window.innerWidth` |

## Budget

A failed target blocks the PR. The current SLO has no error budget because the surface is fully reproducible in CI.

## Measurement

Run the suite on every PR:

```sh
npx playwright install chromium
npm run test:browser
```

The Playwright test results are uploaded as the CI artifact. The production Vercel preview runs the same gate.

## Reporting

The accessibility SLO is reported in the per-PR summary. A regression in any target opens a follow-up issue before the PR is closed.

## Cross-references

- `docs/runbooks/a11y-test.md` — accessibility test runbook.
- `docs/audit/a11y-changelog.md` — accessibility changelog.
- `docs/adr/0009-skip-nav-hook.md` — shared skip-nav controller hook.
- `tests/browser/phlebas.spec.ts` — Playwright suite.
