# Accessibility test runbook

This runbook is the operator-facing procedure for running the
accessibility test suite. The suite is a Playwright Chromium
run that exercises the skip-nav, the 44px tap targets, the
landing skip links, and the simulation-frame layout at
multiple viewport widths.

## When to use

Use this runbook when one or more of the following is true:

* a new layout component is added to the simulation frame or
  the trading terminal;
* a new viewport breakpoint is added to the CSS;
* the skip-nav behavior changes;
* a Playwright test fails in CI.

## Local run

```sh
npx playwright install chromium
npm run test:browser
```

The suite spins up a Next.js production server on `127.0.0.1` at
a free port. The suite uses a persistent browser context per
worker and tears down the context after each test.

## CI run

CI runs the suite on every PR. The CI workflow uses the same
Playwright Chromium image. The suite must pass before the PR
can merge.

## What the suite covers

* Skip-nav wrap at 320px (links are side-by-side, not stacked)
* Skip-nav in flow at 320px does not cover the topbar brand
* Skip-nav returns to hidden state after a skip-link is
  activated at 1440px with reduced motion
* 44px tap targets on desktop (buttons, links, inputs)
* Landing skip links reach journeys, evidence, and the terminal
  preview
* Skip-target scroll-margin on unhashed ids
* Skip-link focus ring is not clipped
* Reduced-motion skip-nav keeps the nav in flow

## Failure modes

| Symptom | Cause | Action |
| --- | --- | --- |
| skip-nav test fails at 320px | layout overflows the nav at 320px | check the `.skipNav` flex-direction in `terminal.module.css` |
| skip-nav covers the brand at 320px | the nav's transform is not reset at sub-820px | check the `@media (max-width: 820px) .skipNav:focus-within` block |
| skip-nav stays visible after activation | the `data-skip-nav-state` attribute is not set | check the `useEffect` in `simulation-frame.tsx` |
| 44px tap target fails on desktop | the component does not enforce `min-width: 44px` and `min-height: 44px` | check the component's CSS |
| skip-link focus ring is clipped | the skip-nav has `overflow: hidden` that clips the focus ring | check the `.skipNav:focus-within` overflow rule |

## Rollback

If the suite fails in CI and the fix is not obvious, revert the
PR and open a follow-up. The accessibility surface is not
reverted individually.

## Skip-nav controller contract

The simulation frame's skip-nav is a React component that wires a
pure state machine to a DOM <nav> element. The state machine
(src/lib/skip-nav-state.ts) is the source of truth. The DOM
element carries a data-skip-nav-state attribute that mirrors the
state. The CSS rule
src/components/terminal.module.css
applies the 	ransform: translateY(-220%); min-height: 0;
pointer-events: none; rules when the attribute is
hidden-after-activation.

### State values

| State | Trigger | DOM attribute | CSS effect |
| --- | --- | --- | --- |
| hidden | initial render | data-skip-nav-state="hidden" | off-screen via the default 	ransform: translateY(-220%) |
| isible | focusin on the nav or a child link | data-skip-nav-state="visible" | in flow via the :focus-within rule |
| hidden-after-activation | click on a skip link, or Escape after activation | data-skip-nav-state="hidden-after-activation" | off-screen and non-interactive even when focused |

### Controller wiring

The controller lives in the useEffect in
src/components/simulation-frame.tsx. It registers three
listeners on the nav:

* click calls 
extSkipNavState(state, { kind: "click" })
* ocusin calls 
extSkipNavState(state, { kind: "focusin" })
* keydown calls 
extSkipNavState(state, { kind: "keydown", key }) for Escape

The controller is a thin DOM adapter. It never reaches out to the
network and never signs a transaction. The state machine is the
only place that decides the next state. To change the behavior,
edit the state machine and the CSS rule. The Playwright tests
assert the attribute transitions on click, focusin, and Escape.