# Accessibility SLO

This document is the SLO (service level objective) for the
accessibility surface. The surface is the skip-nav, the 44px
tap targets, the landing skip links, and the simulation-frame
layout at multiple viewport widths.

## Availability

The accessibility surface is available for 99.5 percent of the
rolling 30-day window. The window excludes scheduled maintenance
that the operator announces at least 24 hours in advance.

## Latency

The skip-nav reveal is immediate on focus. The Playwright suite
asserts the nav is visible within one frame after the user
presses Tab.

## Coverage

* Skip-nav wrap at 320px
* Skip-nav in flow at 320px does not cover the topbar brand
* Skip-nav returns to hidden state after a skip-link is
  activated at 1440px with reduced motion
* 44px tap targets on desktop
* Landing skip links reach journeys, evidence, and the terminal
  preview
* Skip-target scroll-margin on unhashed ids
* Skip-link focus ring is not clipped
* Reduced-motion skip-nav keeps the nav in flow

## Out of scope

* A general accessibility audit (axe-core or similar). The
  current suite covers the skip-nav and tap targets; a full
  audit is a separate slice.
* Keyboard navigation in the matcher and gateway stubs. The
  matcher and gateway are local stubs; the suite does not
  cover their keyboard surface.
* Screen reader testing. The current suite uses Playwright
  Chromium; screen reader testing is a manual process.
