# Accessibility changelog

This changelog records every accessibility-affecting commit to Phlebas. Each entry links to the relevant code, docs, and tests.

## 01-09-2026 — Shared skip-nav controller hook

* `src/lib/skip-nav-state.ts` — pure state machine. `nextSkipNavState(current, event)` maps `{kind: "click"}` to `hidden-after-activation`, `{kind: "focusin"}` to `visible`, `{kind: "keydown", key: "Escape"}` to `hidden-after-activation`, and every other key or event to a no-op.
* `src/lib/skip-nav-state.test.ts` — five unit tests for the state machine. The state machine is the only place that decides the next state.
* `src/lib/use-skip-nav-controller.ts` — React hook that wires the state machine to a DOM element through three DOM event listeners. The hook is a thin DOM adapter. It never reaches out to the network and never signs a transaction.
* `src/components/simulation-frame.tsx` — first consumer. The simulation frame nav has the controller and the `data-skip-nav-state` initial attribute.
* `src/components/trading-terminal.tsx` — second consumer. The trading terminal nav (12 skip links) has the controller and the `data-skip-nav-state` initial attribute.
* `src/components/terminal.module.css` — `data-skip-nav-state="hidden-after-activation"` rule applies `transform: translateY(-220%); min-height: 0; pointer-events: none;` even when the nav is focused.
* `tests/browser/phlebas.spec.ts` — six new Playwright tests:
  * trading-terminal skip-nav sets `data-skip-nav-state="hidden-after-activation"` after a skip link is clicked
  * trading-terminal skip-nav stays `hidden-after-activation` on re-tab until a non-Escape key lands
  * trading-terminal skip-nav sets `data-skip-nav-state="hidden-after-activation"` on Escape after activation
  * simulation-frame skip-nav sets `data-skip-nav-state="hidden-after-activation"` after a skip link is clicked
  * simulation-frame skip-nav returns `data-skip-nav-state` to `visible` when a child skip link is refocused after activation
  * simulation-frame skip-nav sets `data-skip-nav-state="hidden-after-activation"` on Escape after activation
* `docs/adr/0009-skip-nav-hook.md` — ADR for the shared hook.
* `docs/runbooks/a11y-test.md` — accessibility test runbook with the controller contract.
* `docs/operations/a11y-slo.md` — accessibility SLOs.
* `PROGRESS.md` — batch summary entry for the slice.

Acceptance:

* `npm run lint` clean
* `npm test` 1055 / 1055 pass (state machine adds 5 tests; net 1055 because three tests were removed upstream)
* `npm run scan:secrets` clean
* `npm run build` clean

Stack base: `origin/main` at `944c8b6`. No key or token touched.
