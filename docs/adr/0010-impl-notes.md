# ADR 0010 implementation notes

This file records the implementation deviations, follow-ups, and
operational guidance for the 320px skip-nav wrap slice. The ADR
itself is in `0010-skip-nav-wrap.md`; this file is the change log
that operators and reviewers reach for when the behavior diverges
from the design.

## Implementation deviations

1. **Skip-nav controller via inline `useEffect`.** The skip-nav
   activation state is managed by a `useEffect` in
   `src/components/simulation-frame.tsx`. The effect adds
   `click`, `focusin`, and `keydown` listeners to the nav element
   and toggles a `data-skip-nav-state` attribute. A separate
   `SkipNavController` client component was considered and
   abandoned because the existing component is already a client
   component and the inline effect keeps the surface minimal.

2. **CSS-only hidden state.** The `data-skip-nav-state="hidden-after-activation"`
   attribute hides the nav via CSS. The `:focus-within` rule is
   overridden in the hidden state so a re-focus on the nav does
   not reveal it again. The `pointer-events: none` rule prevents
   accidental clicks on the hidden nav.

3. **Playwright tests are not run locally.** The Playwright
   suite spins up a Next.js production server and a Chromium
   browser. Both are heavy for local development. The tests run
   in CI; the local QA gate is `npm run lint && npm run
   typecheck && npm test && npm run scan:secrets && npm run
   build`.

## Out of scope

* A general accessibility audit. The skip-nav wrap is one
  accessibility fix; a full audit is a separate slice.
* A redesign of the skip-nav. The current nav is a column at
  desktop and a wrapping row at mobile. A redesign would
  consider a different visual treatment.
* Skip-nav wiring in `src/components/trading-terminal.tsx`.
  The trading terminal also renders a skip-nav; the controller
  is duplicated from the simulation frame. A future PR can
  extract the controller into a shared component.

## Follow-up work

* Extract the skip-nav controller into a shared component.
* Add skip-nav wiring to `trading-terminal.tsx`.
* Add a Playwright test for the trading-terminal skip-nav.
* Run a full accessibility audit (axe-core or similar).
