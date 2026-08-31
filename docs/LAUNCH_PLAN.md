# Phlebas Launch Plan

Status: custody launch stages superseded

The pZEC, reserve, deposit, withdrawal, and passive-pool stages below describe ADR 0001. The active sequence is in [DELIVERY_PLAN.md](DELIVERY_PLAN.md) and [ADR 0002](adr/0002-native-zec-atomic-settlement.md). No Testnet or Mainnet action is approved by this historical plan.

The current implementation is a local and Vercel no-value simulation with undeployed Sepolia sources and optional loopback testnet services as of 31-08-2026. Entering closed Testnet remains a separately approved gated stage.

Phlebas may be developed and published as a no-value simulation, then advanced to a separately approved no-value testnet stage. It must not accept real ZEC, mint redeemable tZEC, list real USDC or USDT, charge trading fees, or accept real liquidity until the mainnet gate passes. USDT0 is abandoned.

This plan is risk planning, not legal advice. [LEGAL_AND_COMPLIANCE.md](./LEGAL_AND_COMPLIANCE.md) records the current regulatory assumptions and primary sources.

## Launch principles

- Deny country access by default. Only a country with a current written approval may be enabled.
- Keep user signing local. The web application never receives a seed phrase or private key.
- Treat the ZEC reserve and tZEC mint as custody, regardless of the interface design.
- Keep custody keys, ledgers, matching, screening records, and regulated operations outside Vercel.
- Start with one chain, final-deposit-transaction transparency, spot trading, and USDC.
- Add LP pools only after custody and order-book controls have operated successfully under real conditions.
- USDT0 is abandoned. Native USDT is a listed quote in this simulation and still needs issuer-native mainnet approval.
- Exclude shielded ZEC, leverage, margin, lending, derivatives, staking, governance tokens, and reward programs from v1.

## 30-day critical path

The date does not waive a gate. If every mainnet item below lacks dated evidence and an accountable approval by day 28, day 30 is a no-value public-testnet launch, not mainnet.

- Days 1-5: freeze the order schema and contract interfaces, merge the hardening work, engage independent reviewers, assign every legal and operational owner, and deploy the exact reviewed commit to closed Sepolia.
- Days 6-12: connect the isolated testnet gateway, Zcash observers, matcher, settlement submitter, reconciliation, monitoring, and append-only audit records. Exercise complete deposit, mint, trade, burn, and payout flows with valueless assets.
- Days 13-18: run invariant, fuzz, load, denial-of-service, reorganization, replay, reserve-deficit, signer-loss, stablecoin, pause, and disaster-recovery tests. Freeze the release candidate after fixes.
- Days 19-24: remediate and independently retest every Critical or High finding; finish entity, license or partner, country, custody, asset-listing, privacy, and customer-document approvals.
- Days 25-27: reproduce bytecode and configuration from the release commit, verify role separation and monitoring, rehearse rollback and emergency stops, and obtain signed security, legal, compliance, operations, and product evidence.
- Days 28-30: hold the formal go/no-go review. Launch only the restricted USDC canary if every gate passes; otherwise publish testnet status and the unresolved blockers without accepting value.

## Product boundary

### Vercel web application

The Vercel deployment may provide:

- Public product and risk information.
- Local EVM-wallet connection for Arbitrum testnet only.
- Client-side order and transaction construction.
- Local EVM-wallet signing for Arbitrum testnet only.
- Read-only order-book, pool, trade, reserve, and chain views.
- Display a short-lived country-eligibility result and feature flags issued by a separate approved service. Vercel must not decide eligibility or store identity and screening records.
- Non-authoritative testnet API proxies.

The Vercel deployment may not receive customer assets, user private keys, reserve keys, administrator keys, identity files, sanctions cases, or authoritative custody and matching data. See the [Vercel shared responsibility model](https://vercel.com/docs/security/shared-responsibility) and [sensitive environment variable documentation](https://vercel.com/docs/environment-variables/sensitive-environment-variables).

Native Zcash wallet use remains a ZIP 321 or TEX QR, deep-link, or copy handoff followed by independent chain observation. The Vercel application does not connect directly to, sign through, or proxy a Zcash wallet or wallet RPC.

### Regulated and security-sensitive services

Any production custody service must run under the licensed operator on isolated infrastructure. It needs HSM or MPC key custody, private networking, durable state, controlled production access, independent approvals, append-only logs, monitoring, and tested disaster recovery.

This tier includes:

- Zcash nodes and TEX deposit address management.
- Deposit validation, confirmation, and reorganization workers.
- Reserve custody and customer-level liability records.
- Mint, burn, redemption, hot-wallet, and withdrawal services.
- The authoritative order matcher and settlement service.
- Market-surveillance records and alert handling.
- Identity, Travel Rule, sanctions, and suspicious activity systems.
- Reserve reconciliation and attestation data.

## Stage 0: repository and local simulation

Current status: exit candidate. Deterministic matching, cancellation, partial fills, LP shares, conservative rounding, fee accounting, signed orders, persistence recovery, and core contract invariants are covered locally; independent review and named ownership remain required.

Goal: prove the product model without deployed value.

Required work:

- Record the architecture, trust boundaries, threat model, asset specifications, and failure states.
- Implement deterministic matching and Uniswap v2 style pool math in tests and simulations.
- Define tZEC supply, decimal, reserve, mint, burn, fee, fork, and reorganization invariants.
- Define the country-policy schema with every country disabled.
- Add no production contracts, keys, deposits, fees, rewards, token sale, or future token entitlement.

Exit criteria:

- Tests cover order priority, partial fills, cancellations, rounding, LP shares, slippage, fees, and reserve invariants.
- The design review finds no path that gives the Vercel application access to custody or user keys.
- Every unresolved legal or product choice is listed with an owner.

## Stage 1: closed testnet

Goal: test full flows with invited testers and assets that have no value.

Controls:

- Use Zcash testnet and one EVM testnet.
- Name native Zcash faucet value `Testnet ZEC` and the EVM receipt `tZEC`. Name quote faucets `tUSDC` and `tUSDT`. Every balance, burn, and test vector must preserve the native `Testnet ZEC` versus EVM `tZEC` distinction. USDT0 is abandoned.
- Use faucets to fund valueless native `Testnet ZEC`, `tUSDC`, and `tUSDT`. Mint and burn `tZEC` only through the test gateway state machine being exercised.
- Permit `tZEC` to map technically to valueless native `Testnet ZEC` for controlled deposit and payout tests. No test asset creates a legal or economic claim on mainnet ZEC, a future token, a reward, or monetary value.
- Keep fees at zero.
- Allowlist testers and cap balances, orders, mints, withdrawals, and pool deposits.
- Use a fresh single-use test TEX address for each deposit intent and inspect every input and output in the final transaction before minting.
- Use simulated identity, sanctions, and Travel Rule data unless counsel approves real personal data collection.

Required exercises:

- Zcash and EVM reorganization handling.
- Duplicate deposit and replay prevention.
- Delayed, failed, and rejected mint and redemption events.
- Reserve deficit and proof-of-liabilities mismatch.
- Stablecoin freeze, depeg, chain halt, and contract pause.
- Matcher outage, stale order, partial fill, and duplicate order.
- LP imbalance, sandwich, stale reference price, and withdrawal stress.
- Key compromise, signer loss, emergency pause, and recovery.

Exit criteria:

- No unresolved Critical or High defect.
- Reserve and liability totals reconcile after every exercise.
- Every administrative action appears in an append-only log.
- Incident owners complete a documented recovery drill.

## Stage 2: public testnet

Goal: test public load and adversarial behavior without financial value.

Controls from Stage 1 remain binding. Public testnet must not imply that a production launch, reward, airdrop, or valuable token is promised.

Required work:

- Publish contract addresses, test limitations, known risks, and reporting instructions.
- Complete independent smart-contract and infrastructure reviews.
- Run invariant, fuzz, load, denial-of-service, and economic attack tests.
- Exercise rate limits, price collars, self-trade prevention, cancel-on-disconnect, and market-abuse alerts.
- Verify that blocked countries remain blocked and that an unknown country fails closed.
- Verify that Vercel logs, build output, error reports, and analytics contain no secrets or regulated personal data.

Exit criteria:

- Independent reviews are closed or have accepted residual risks with named owners.
- No unresolved Critical or High security finding.
- Load and recovery targets pass under recorded conditions.
- Legal, licensing, custody, stablecoin, and country gates have named owners and current status.

Public testnet completion does not authorize mainnet.

## Stage 3: restricted USDC mainnet canary

Goal: open a capped, single-chain, spot-only market after every mainnet gate passes.

Initial scope:

- Native ZEC against issuer-native USDC only.
- A chain listed in [Circle's supported chains and currencies](https://developers.circle.com/circle-mint/supported-chains-and-currencies).
- Final-transaction-transparent ZEC deposits through fresh, single-use TEX addresses.
- A licensed custody and bridge operator.
- Approved countries and customer types only.
- Fully funded spot orders with no leverage, margin, credit, derivative, or shorting function.
- Fixed customer, deposit, withdrawal, mint, order, and daily venue caps.
- No LP pool, reward, governance, referral, or yield program at canary start.

Canary expansion requires a dated review of custody reconciliation, incidents, complaints, surveillance alerts, liquidity, slippage, withdrawal performance, and stablecoin events. A cap increase is a separate production change.

## Stage 4: LP pools

LP pools may open only after the USDC order book and custody service pass the agreed canary review period without an unresolved material control failure.

Required LP gate:

- LP token classification and country approval.
- Independent review of pool math, rounding, first-deposit, donation, reserve-skew, price-manipulation, reentrancy, and withdrawal behavior.
- Clear slippage, fee, impermanent-loss, price, smart-contract, tZEC custody, and stablecoin risk disclosures.
- Monitoring for manipulation between the order book and pool.
- Per-pool and per-provider caps.
- No claim of guaranteed yield, stable return, or principal protection.

## Stage 5: native USDT

Native USDT is already a listed quote in this no-value simulation. USDT0 is abandoned.

Mainnet native USDT, if ever approved, is a new launch decision after the USDC canary. It can proceed only when:

- The production contract, decimals, and issuer-native path are independently verified. USDT0 is not that path.
- Counsel approves native USDT for the entity and every enabled country.
- The operator receives written advice on the current [Tether terms](https://tether.to/en/legal/), including restrictions that refer to a Singaporean Person.
- The stablecoin listing committee approves issuer, reserve, sanctions, blacklist, freeze, depeg, chain, upgrade, and redemption risks.
- Automated controls stop deposits and trading on a blacklist, freeze, depeg threshold, or contract incident.
- An independent security review covers the exact chain and contract integration.
- Customer terms state that Phlebas does not provide direct issuer redemption.

A failed or missing item keeps mainnet USDT disabled. The simulation may still label `ZEC-USDT`.

## Mainnet go or no-go gate

Every item below requires dated evidence, a named owner, and approval by the accountable legal, compliance, security, and product roles. One failed, expired, or unresolved item produces a no-go.

### Entity and legal scope

- The operating entity, ownership, directors, management location, service providers, and contracting parties are fixed.
- Singapore counsel signs a written Payment Services Act, Financial Services and Markets Act, Securities and Futures Act, anti-money laundering, sanctions, privacy, and consumer opinion.
- Each enabled country has a written licensing, marketing, custody, exchange, token-listing, Travel Rule, market-abuse, consumer, and data matrix.
- Required licenses and registrations are active, or a licensed partner contract allocates every regulated duty.
- Country controls have passed independent deny-by-default tests.
- Counsel and the security owner approve one direct-contract access model across tZEC, settlement, and pools. Frontend-only geoblocking is not accepted as enforcement.

### Custody and tZEC

- The licensed reserve custodian and tZEC issuer are named.
- Customer title, trust or segregation, insolvency, loss allocation, redemption, suspension, fork, fee, and complaint terms are approved.
- Per-intent TEX uniqueness and rejection of any shielded component or nontransparent output in the final deposit transaction are enforced.
- Confirmation, reorganization, duplicate, and replay policies are tested.
- HSM or MPC keys, dual control, signer separation, mint caps, withdrawal limits, recovery, and emergency pause are tested.
- Proof of reserves and customer-level proof of liabilities reconcile at the required frequency.
- Independent attestation, audit access, record retention, insurance decisions, and business continuity are approved.

### Anti-money laundering and sanctions

- Customer, business, beneficial-owner, age, and eligibility checks are live.
- Politically exposed person, sanctions, source-of-funds, source-of-wealth, and ongoing screening rules are approved.
- Zcash transparent-chain and EVM monitoring are live.
- Travel Rule, suspicious activity, blocked-property, record, escalation, and reporting procedures are tested.
- The controls follow the risk-based approach in the [OFAC virtual currency guidance](https://ofac.treasury.gov/system/files/126/virtual_currency_guidance_brochure.pdf) and the applicable local rules.

### Assets and stablecoins

- ZEC, tZEC, USDC, and any LP token have written legal classifications and listing approval for every enabled country.
- USDC uses the official contract on a Circle-supported chain.
- Chain ID, contract, decimals, transfer behavior, blacklist, pause, depeg, and issuer incident responses are tested.
- Customer materials make no issuer sponsorship or direct redemption claim.
- USDT0 remains abandoned. Mainnet native USDT stays disabled until its Stage 5 gate passes.

### Smart contracts and infrastructure

- Two independent reviews cover the final deployed smart-contract bytecode and configuration.
- Invariant, fuzz, economic, permission, upgrade, pause, recovery, and integration tests pass.
- Administrator powers, timelocks, signers, upgrades, fees, and emergency actions are publicly disclosed.
- The Vercel application has no custody, mint, withdrawal, customer identity, or authoritative matching secret.
- Production nodes, signers, databases, queues, ledgers, monitoring, backups, and disaster recovery pass security review.
- Penetration tests and incident exercises have no unresolved Critical or High result.

### Order book and market integrity

- Matching follows documented price-time priority.
- Self-trade prevention, stale-order handling, cancel-on-disconnect, price collars, size limits, and rate limits pass tests.
- Wash trading, spoofing, layering, marking, manipulation, and related-account alerts are live.
- Order, cancellation, fill, administrative-action, and account records are append-only, time-synchronized, and retained for the required period.
- Market-maker, affiliate, fee, rebate, listing, and conflict policies are approved.
- Public market data and regulatory reporting are available where required.

### Consumer protection and operations

- Terms state fees, spreads, slippage, partial fills, finality, confirmation times, outages, redemption, and complaint procedures.
- Risk disclosures cover tZEC custody, reserve, insolvency, fork, key, smart-contract, USDC, blacklist, freeze, depeg, transparent Zcash, and liquidity risk.
- Marketing contains no promise of privacy, stable return, guaranteed liquidity, guaranteed redemption timing, principal protection, or regulatory approval.
- Support, incident notification, complaints, data access, data deletion, and breach procedures are tested.
- Operating limits, incident owners, recovery targets, and stop conditions are approved.

## Automatic stop conditions

Deposits, minting, trading, or withdrawals must stop within the approved response time when any applicable condition occurs:

- Reserve or liability mismatch.
- Custody, mint, administrator, or signing-key compromise.
- Unresolved chain reorganization or finality failure.
- Smart-contract exploit or Critical or High security finding.
- Stablecoin blacklist, freeze, depeg threshold, unsupported chain, bridge halt, or issuer incident.
- Sanctions match, required reporting failure, or material monitoring outage.
- Matcher divergence, settlement inconsistency, or missing audit records.
- Loss of license, partner authority, insurance, banking, attestation, or required legal approval.
- Country control failure or access from an unapproved country.
- Consumer loss pattern or complaint volume above the approved threshold.

Restart requires root-cause closure, reconciled state, written incident review, and approval from the roles assigned to that stop condition.

## Decisions still required

- Legal entity and place of management.
- Countries and customer types.
- Production EVM chain.
- Licensed custodian, tZEC issuer, and mint controller.
- On-chain or off-chain matching and settlement design.
- Account, identity, and Travel Rule providers.
- Redemption model and customer counterparty.
- Market makers and affiliated-trading policy.
- Fees, caps, insurance, audit, and attestation providers.
- LP token rights and fee allocation.
- Owners and measurable thresholds for every automatic stop condition.
