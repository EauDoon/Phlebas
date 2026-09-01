# ADR 0009: Shared skip-nav controller hook

Date: 01-09-2026
Status: Accepted
Related: [ADR 0002](0002-native-zec-atomic-settlement.md), [ADR 0007](0007-public-market-data.md)

## Context

The skip-nav is the first focusable element on every Phlebas page. The simulation frame and the trading terminal each render a `<nav aria-label="Skip links">` with one or more `Skip to ...` links. Each nav must stay hidden until a user focuses it, must hide again after the user activates a skip link, and must return to visible on the next focusin. The activation behavior also has to be recoverable with the Escape key so a screen-reader user can dismiss the nav without leaving the page.

The state behind this is identical for both components: `hidden`, `visible`, and `hidden-after-activation`. The transitions are click → hidden-after-activation, focusin → visible, Escape → hidden-after-activation, and every other key is a no-op. Inlining the same `useEffect` + `useRef` + `addEventListener` block in each component is duplication, and the inline version was untestable in isolation.

## Decision

Extract the controller into a pure state machine in `src/lib/skip-nav-state.ts` and a thin React adapter in `src/lib/use-skip-nav-controller.ts`. The state machine is a function over a state record and never reaches out to the network. The hook takes a `RefObject<HTMLElement | null>` and wires the state machine to the DOM element through the three DOM event listeners.

Both `src/components/simulation-frame.tsx` and `src/components/trading-terminal.tsx` consume the same hook. The CSS rule that hides the nav when the data attribute is `hidden-after-activation` lives in `src/components/terminal.module.css` and is keyed on the `data-skip-nav-state` attribute, not on a class string, so a future third component can adopt the controller by adding one `useRef` + one `useSkipNavController` call.

## Consequences

The state machine is testable in isolation in `src/lib/skip-nav-state.test.ts`. The hook has no isolated unit test because adding `jsdom` is a new dependency; the integration is asserted by Playwright in `tests/browser/phlebas.spec.ts` on both `/trade` (trading terminal) and `/status` (simulation frame).

The data-skip-nav-state attribute is the single source of truth in the DOM. The visual class string is derived from it by `src/lib/skip-nav-restore.ts` if a downstream component needs the class.

Out of scope: a full accessibility audit, screen-reader compatibility testing, and wiring the controller in any future surface that wraps `trading-terminal` in a new shell.

## Cross-references

- `src/lib/skip-nav-state.ts` — pure state machine.
- `src/lib/skip-nav-state.test.ts` — state machine unit tests.
- `src/lib/use-skip-nav-controller.ts` — React hook.
- `src/components/simulation-frame.tsx` — first consumer.
- `src/components/trading-terminal.tsx` — second consumer.
- `src/components/terminal.module.css` — `data-skip-nav-state="hidden-after-activation"` rule.
- `docs/runbooks/a11y-test.md` — accessibility test runbook.
- `docs/operations/a11y-slo.md` — accessibility SLOs.
- `docs/audit/a11y-changelog.md` — accessibility changelog.
- `tests/browser/phlebas.spec.ts` — Playwright controller tests.
