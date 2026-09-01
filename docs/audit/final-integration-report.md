# Native settlement integration report

This report describes the key-independent native-ZEC exchange work
integrated on the current feature branch. It is development evidence,
not a production-readiness or value-safety attestation.

## Integrated surfaces

* **EVM leg:** a conditional-lock contract, typed-order primitives,
  deployment scripts, and Foundry coverage for lock, claim, refund,
  pause, and authorization behavior.
* **Zcash leg:** transparent P2SH construction and parsing, atomic-swap
  script primitives, transaction-building adapters, address and amount
  validation, and deterministic test vectors.
* **Coordination:** a fail-closed state model, persistence and corruption
  checks, transition projection, reorg detection, and diagnostic
  observation surfaces.
* **Trading:** two ZEC stablecoin markets, matcher and public market-data
  primitives, an order book, order entry, market activity, and pool
  interfaces.
* **Operations:** health, metrics, SLO, alert-routing, rate-limiting,
  incident, restart, predeployment, postdeployment, and rollback
  controls.
* **Experience:** landing, trading, liquidity, native-settlement,
  architecture, legal, security, and status interfaces across desktop
  and narrow viewport journeys.

## Current verification

| Surface | Result |
| --- | --- |
| ESLint | pass, 0 errors and 0 warnings |
| TypeScript | pass, 0 errors |
| Node tests | pass, 801 of 801 |
| Foundry tests | pass, 70 of 70 |
| Secret scan | pass, 435 files scanned |
| Production build | pass, 15 routes |
| Browser acceptance | pass, 231 of 231; rerun required on the exact candidate commit |

The diagnostic observer and coordinator are deliberately isolated from
production value authority. They may describe candidate state, but they
must not authorize a claim, refund, payout, settlement, or balance
change.

## Production hold

The absence of active browser signing is one protection, but it is not
the only release gate. Production remains blocked until the exact
release artifact has, at minimum:

* contract and signed-order commitments bound to one canonical swap ID
  and terms hash;
* an explicit production token allowlist and verified stablecoin
  identities;
* strict Zcash input-spend evidence without height-only inference;
* strict EVM event decoding against the deployed contract ABI, address,
  chain, and transaction finality;
* matcher output bound to the same canonical signed terms consumed by
  settlement;
* durable, replayable, independently verified chain journals;
* wallet compatibility and complete testnet execution evidence;
* production alerting, metrics, key separation, deployment, verification,
  rollback, and independent security-review evidence; and
* a green browser matrix and exact-commit Vercel preview.

The canonical open controls are tracked in
`docs/audit/audit-checklist.md`. A checklist label, manual sign-off, or
successful UI deployment cannot supersede a failed technical or safety
gate.
