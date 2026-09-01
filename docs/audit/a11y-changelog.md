# Accessibility changelog

This file tracks changes to the accessibility surface. Each
entry must include the date, the change, and the reason.

## 01-09-2026 — initial surface

- Added `src/lib/skip-nav-state.ts` with `nextSkipNavState` and
  `isSkipNavVisible` pure functions.
- Added `src/lib/skip-nav-restore.ts` with `skipNavClass` pure
  function.
- Added `src/components/simulation-frame.tsx` `useEffect` that
  wires the state machine to the nav's `data-skip-nav-state`
  attribute.
- Added CSS rules in `src/components/terminal.module.css` for
  the `data-skip-nav-state` attribute and the 320px wrap.
- Added Playwright tests in `tests/browser/phlebas.spec.ts` for
  the 320px wrap, the brand on screen, the re-hide after
  activation, the data-skip-nav-state transitions, the 320px
  single row, and the 320px banner.
- Added ADR 0010 and impl notes.
- Added `docs/runbooks/a11y-test.md`, `docs/operations/a11y-slo.md`,
  `docs/audit/a11y-checklist.md`, and `docs/operations/a11y-verdict-history.md`.
- Added THREAT_MODEL section 24, ARCHITECTURE section, and
  SOURCES references.
- Updated `docs/per-pr-summary.md` with the PR 9 entry.
- Updated `docs/index.md` with the skip-nav ADR, a11y SLO, and
  a11y runbook.
- Updated `docs/adr/0002-native-zec-atomic-settlement.md` with
  the canonical form and cross-references.
