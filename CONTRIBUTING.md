# Contributing to Phlebas

Phlebas is currently a design and no-value simulation. Do not add live deposit addresses, custody credentials, production endpoints, real signing keys, fabricated market data, or language that implies the system is deployed or audited.

## Before proposing a change

1. Read `README.md`, `docs/PRODUCT_SPEC.md`, `docs/ARCHITECTURE.md`, and `SECURITY.md`.
2. Keep the public interface outside the custody, matching, identity, and withdrawal trust zones.
3. Update the threat model when a change adds authority, assets, callbacks, external calls, or a new failure mode.
4. Cite primary sources for facts that can change.
5. Preserve explicit simulation, settlement-asset, custody, and privacy labels.

## Local checks

```bash
npm install
npm run check
```

Changes should include focused tests for numerical behavior and safety invariants. UI changes should be checked at 320, 390, 768, and 1440 pixels, with keyboard navigation and reduced-motion settings.

## Scope discipline

Version 1 excludes leverage, lending, liquidations, shielded deposits, arbitrary pools, token incentives, farms, dynamic fees, callbacks, and proxy upgrades. A proposal to add any excluded feature requires a new architecture decision, independent security review, compliance impact analysis, and explicit project approval.

## Security reports

Do not disclose a suspected vulnerability in a public issue. Follow the private reporting process in `SECURITY.md` once a verified reporting channel is published. Until then, do not send secrets or exploitation details to an unverified address.

## License

No software license has been selected. Contributions cannot be accepted until the repository owner chooses contribution and licensing terms.
