# Accessibility checklist

This document is the canonical accessibility checklist for the
Phlebas project. The checklist is the input to the accessibility
audit and the acceptance gate for accessibility-related slices.

## Skip-nav

| ID | Item | Required | Owner | Status |
| --- | --- | --- | --- | --- |
| a11y-1 | Skip-nav is the first focusable element on every page | yes | ui | done |
| a11y-2 | Skip-nav wrap at 320px keeps the total nav height small | yes | ui | done |
| a11y-3 | Skip-nav in flow at 320px does not cover the topbar brand | yes | ui | done |
| a11y-4 | Skip-nav returns to hidden state after a skip-link is activated | yes | ui | done |
| a11y-5 | Skip-nav re-hides when the user presses Escape | yes | ui | done |

## Tap targets

| ID | Item | Required | Owner | Status |
| --- | --- | --- | --- | --- |
| a11y-6 | Buttons stay 44px on desktop | yes | ui | done |
| a11y-7 | Links stay 44px on desktop | yes | ui | done |
| a11y-8 | Inputs stay 44px on desktop | yes | ui | done |

## Landing

| ID | Item | Required | Owner | Status |
| --- | --- | --- | --- | --- |
| a11y-9 | Landing skip links reach journeys, evidence, and the terminal preview | yes | ui | done |
| a11y-10 | Landing skip links stay 44px on desktop | yes | ui | done |
| a11y-11 | Landing mobile menu links stay 44px | yes | ui | done |

## Trade

| ID | Item | Required | Owner | Status |
| --- | --- | --- | --- | --- |
| a11y-12 | Trade skip links reach ticket, chart, book, blotter, tape | yes | ui | done |
| a11y-13 | Ticket keyboard copy is a named 44px region | yes | ui | done |
| a11y-14 | Ticket G/I/F stay idle while review is open | yes | ui | done |
| a11y-15 | Ticket side, type, and time-in-force groups move focus with arrows and select with Enter/Space | yes | ui | done |

## Out of scope

* A general accessibility audit (axe-core or similar). The
  current checklist covers the skip-nav and tap targets; a full
  audit is a separate slice.
* Screen reader testing. The current checklist is verified by
  Playwright; screen reader testing is a manual process.
* Keyboard navigation in the matcher and gateway stubs. The
  matcher and gateway are local stubs; the checklist does not
  cover their keyboard surface.
