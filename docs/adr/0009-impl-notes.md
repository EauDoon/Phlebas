# ADR 0009 implementation notes

This file records the implementation deviations, follow-ups, and
operational guidance for the final integration surface. The ADR
itself is in `0009-final-integration-audit.md`; this file is the
change log that operators and reviewers reach for when the live
service does not match the design.

## Implementation deviations

1. **The release verdict is currently `not ready`.** The audit
   checklist has 7 of 26 required items that are not yet done.
   The release is blocked on those items. The items are
   deployment-time concerns, not code-time concerns.

2. **The `contracts` gate is `skip` locally and `pass` in CI.**
   The Foundry toolchain is not installed locally; the gate
   uses the `skip` status to indicate that the gate was not
   run locally. The CI workflow installs Foundry and runs
   `forge test --root contracts`.

3. **The audit checklist is committed in code review, not
   generated.** The audit checklist is a markdown file under
   `docs/audit/`. A future PR may add a script that generates
   the checklist from a structured source.

## Out of scope

* The production deployment.
* The audit team's review.
* The release notes for the production deploy.

## Follow-up work

* wire the `contracts` gate to the CI workflow;
* add a script that generates the audit checklist from a
  structured source;
* add a release notes template that the on-call engineer fills
  in at release time.
