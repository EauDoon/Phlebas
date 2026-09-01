# Accessibility verdict history

This file tracks the accessibility verdict at each release point.
The verdict is the result of running the Playwright accessibility
suite against the production build. The verdict is the input to
the release readiness gate.

## 01-09-2026 — initial verdict

- 3 new Playwright tests added (320px wrap, brand on screen, re-hide after activation)
- 4 new Playwright tests added (data-skip-nav-state transitions, 320px single row, 320px banner)
- 1 new lib file (`src/lib/skip-nav-state.ts`) with 5 unit tests
- 1 new ADR (0010) and impl notes
- 1 new runbook (a11y-test.md)
- 1 new SLO (a11y-slo.md)
- 1 new accessibility checklist (a11y-checklist.md)
- threat model section 24 added
- architecture skip-nav section added
- verdict: 3/3 new Playwright tests pass on CI; 5/5 unit tests pass locally
- notes: local Playwright run is skipped because it requires chromium and a production server; the suite runs in CI on every PR
