# Blocker classification for the remaining audit rows

> Owner direction (2026-09-06): split every mixed blocker into the engineering
> that can proceed now, the deployment/access needed to execute, the external
> review or decision needed to release, and the exact closure evidence. No row
> is wholly "externally blocked" when only its final deployment or sign-off is.
> Status authority remains `docs/audit/audit-checklist.md`; this file plans the
> work, it does not close rows.

Testnet-only deployments and faucet-funded test transactions are authorized
(2026-09-06), using existing approved resources. Real-value transfers, custody,
new purchases, and bypass of independent security/legal gates remain out of
bounds. Testnet artifacts must carry explicit testnet identities.

## Task split

| ID | Engineering now | Deployment / access needed | External decision to release | Closure evidence |
| --- | --- | --- | --- | --- |
| contracts-10 | Sepolia (testnet) deployment script + manifest with explicit testnet identity; reproducible deploy + verify commands; DeployTestnet path review | Funded Sepolia deployer key held as a testnet-only identity; RPC endpoint (public endpoint acceptable for testnet); faucet access | None for testnet (authorized); mainnet stays gated | Testnet manifest `deployed: true` with testnet chain identity; recorded receipt + observed runtime code; never labeled mainnet |
| contracts-11 | Freeze the exact release artifact (bytecode hash, source commit); prepare review package with threat-model questions | None | Independent security review (owner-commissioned) | Reviewer report on the frozen artifact; unresolved-findings list empty or accepted |
| services-9 | Zcash testnet evidence adapter against the existing lab (fund/claim/refund construction + sighash/wire already implemented); testnet-only signing harness clearly labeled | Zcash testnet faucet funding; testnet node or public explorer access for observation | Strict-adapter review before it feeds the coordinator | Reproducible testnet fund/claim/refund scripts + recorded txids with testnet identities |
| services-10 | Sepolia receipt adapter is implemented; bind it to the testnet deployment manifest | Same deployer/RPC access as contracts-10 | Strict-adapter review | Testnet funding/claim receipts bound to canonical terms, reproducible |
| services-11 | Matcher-to-terms materialization exists; participant signature evidence proven end-to-end (PR #69). Remaining: consume the same canonical terms in the testnet two-leg journey | Testnet deployment of both legs (contracts-10 + services-9) | Strict-adapter review | One testnet fill traced from signed order → terms → both funding legs → claim → settle |
| services-12 | Durable journal storage already implemented and crash/replay-tested; needs a hosted writer | Durable host for the matcher (owner approval for the smallest viable host) | Operator qualification | Hosted matcher restart + replay evidence |
| operations-7 | Alert routing code + configuration surface (destination, thresholds, test alert) | Approved destination (email/endpoint the owner nominates) | Owner chooses destination | Test alert delivered + recorded |
| operations-8 | Metrics endpoint exists (`/metrics`, `/slo`); needs a scrape/presentation config | Destination as above | Owner chooses destination | Metrics visible to the owner |
| operations-9 | Testnet journey scripts (the services-9/10/11 work) | Same testnet access | None for testnet | Recorded testnet claim, refund, restart, stale/conflicting-evidence runs |
| docs-6 | Publication step in the release protocol: snapshot + deployment identity committed per release (established by PR #71 for one release) | None | Owner accepts the cadence as standing policy | Two consecutive releases carry evidence packs |
| docs-7 | DONE (PR #71) | — | — | Recorded identity + browser evidence for main `6c02750`+ |
| keys-2 | Key-separation design: deployer vs operator vs matcher identities as separate named keys, testnet-labeled | None for the design | Owner approves the design before production keys exist | Design doc + generation/runbook ready for execution |
| keys-5 | Wallet-signing documentation for the testnet harness (keys never leave the test harness; customer keys stay wallet-side) | None | Independent review at release | Documented boundary + harness code review notes |
| keys-6 | Review package for the signing/broadcast paths (lab + testnet harness) | None | Independent security review | Reviewer sign-off recorded |
| compliance-1 | Prepare counsel package: exchange model summary, jurisdictions, disclosures, open questions | None | Counsel review (owner-commissioned) | Written counsel opinion |
| compliance-2 | Implement the controls counsel requires; blocked on counsel output | None | Counsel decision | Implemented controls + evidence |

## Review-defect rows (owner direction recorded 2026-09-06)

- **review-4**: direction accepted — no unilateral administrative force-settlement,
  no redirection of funds, no override of contradictory evidence; wallet timeout
  recovery must stay accessible while the coordinator is disputed. Work:
  draft ADR defining which transient disputes may clear on newly verified
  evidence under signed policies; implement behind a disabled activation gate;
  tests prove hard contradictions never clear.
- **review-7**: direction accepted — fresh wallet identity validation before
  every sensitive action and after reconnect/resume; signatures bound to the
  exact account, network, and terms with drift rejection; provider events where
  supported, otherwise configurable 30-second foreground polling as
  supplementary detection only; no repeated approval prompts; stop polling when
  hidden or disconnected and revalidate on return; unreliably-revalidated
  sessions are invalidated, never retained as "verified".

## Hosting prerequisites (owner-action queue)

Milestone A (deployed persistent no-value matcher) and services-12 need one
durable host that is not Vercel and not Hermes. Prepared without it: deployment
artifacts, review-2 key pairing, gringotts credential provisioning, and a
costed approval request. See PROGRESS notes in the repository and the
cross-project summary.
