# ADR 0010: Skip-nav wrap at 320px

Date: 01-09-2026
Status: Accepted
Production status: Not approved

## Context

The skip-nav is the first focusable element on every page. It
is rendered as a fixed-position column that translates off-screen
until focused, then reveals the skip links. At sub-820px the
nav switches to `position: relative` so it sits in flow above the
simulation banner.

At 320px the focused skip-nav stacks all skip links as a column
and consumes a large fraction of the viewport height. The
`topbar` brand sits below the nav in flow, but the nav's height
pushes the brand down and can push it off the viewport on short
screens.

The current behavior also keeps the skip-nav visible after a
skip-link is activated, because `:focus-within` stays true while
the link retains focus during the hash navigation. The nav should
re-hide once activation is complete so the user can read the
target content.

## Decision

The new skip-nav behavior is three small CSS and test changes:

1. **Wrap at sub-820px.** At `max-width: 820px`, the focused
   skip-nav uses `flex-direction: row; flex-wrap: wrap;` so
   skip links lay out side-by-side and wrap. The total nav
   height stays at one or two rows regardless of the number
   of skip links.

2. **Reset transform at sub-820px focused.** At `max-width:
   820px`, the focused skip-nav's `transform` is reset to
   `none` so the base `transform: translateY(-220%)` does not
   leave the nav off-screen when it switches to in-flow
   positioning.

3. **Re-hide after activation.** The current `:focus-within`
   behavior already hides the nav when focus leaves the link.
   The Playwright test asserts the nav is hidden after a
   skip-link is activated at 1440px with reduced motion.

The new behavior is verified by three new Playwright tests
in `tests/browser/phlebas.spec.ts`:

* 320px focused skip-nav wraps skip links and the total height
  stays under half the viewport.
* 320px focused skip-nav in flow does not push the topbar brand
  off screen.
* Skip-nav returns to its hidden state after a skip link is
  activated.

## Consequences

* The skip-nav is usable at 320px without consuming the full
  viewport height.
* The topbar brand stays visible at 320px when the skip-nav is
  focused.
* The skip-nav re-hides after activation, so the user can read
  the target content without the nav overlapping it.

## Out of scope

* A general accessibility audit. The skip-nav wrap is one
  accessibility fix; a full audit is a separate slice.
* A redesign of the skip-nav. The current nav is a column at
  desktop and a wrapping row at mobile. A redesign would
  consider a different visual treatment.

## Related

* PROGRESS.md "Next": 320px skip-nav wrap, terminal brand not
  covered, skip-nav hides after activation.
* `tests/browser/phlebas.spec.ts` — the new Playwright tests
  for this slice.
* `src/components/terminal.module.css` — the CSS changes for
  this slice.
