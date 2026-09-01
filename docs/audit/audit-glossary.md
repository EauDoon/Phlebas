# Audit glossary

This file is the canonical glossary for the audit surface. The
glossary is the input to the audit prep runbook and the audit
team's review.

## Terms

- **Audit checklist**: the canonical record of the audit
  surface. The checklist is at `docs/audit/audit-checklist.md`.
- **Audit prep runbook**: the operator-facing procedure for
  preparing the project for an external audit. The runbook is
  at `docs/runbooks/audit-prep.md`.
- **Audit team**: the security team responsible for the audit.
- **Gate**: a single check in the release readiness verdict. A
  gate is `pass`, `fail`, or `skip`.
- **On-call engineer**: the engineer currently on call. The
  on-call engineer is the only manual gate in the release
  readiness verdict.
- **Open item**: an audit item that is not yet `done`. The open
  items are at `docs/audit/open-items.md`.
- **Release readiness verdict**: the result of
  `scripts/release-readiness.mjs`. The verdict is
  reproducible from the project root.
- **Release verdict evidence pack**: the source of truth for
  the release verdict. The pack is at
  `docs/audit/release-readiness-evidence.md`.
- **Sign-off**: the on-call engineer's approval of the release
  verdict. The sign-off is the only manual gate in the
  release verdict.

## Acronyms

- ADR: Architecture Decision Record
- ASVS: Application Security Verification Standard
- CI: Continuous Integration
- CISO: Chief Information Security Officer
- NIST: National Institute of Standards and Technology
- OWASP: Open Web Application Security Project
- QA: Quality Assurance
- SLO: Service Level Objective
- SOC: Security Operations Center
- SRE: Site Reliability Engineering
- WAF: Web Application Firewall
