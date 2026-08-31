# Phlebas Legal and Compliance Plan

Status: local no-value simulation only as of 30-08-2026. Testnet remains a future gated stage.

Phlebas must not accept real ZEC, mint redeemable pZEC, list real USDC or USDT, charge trading fees, or offer real-value liquidity pools under the current project status. USDT0 is abandoned. Valueless `tZEC` may exercise technical mint, burn, and native Testnet payout paths. No test asset creates a legal or economic claim on mainnet ZEC, a future token, a reward, an airdrop, or monetary value.

This document is risk planning, not legal advice. A qualified lawyer must confirm the rules for the operating entity, custody model, assets, and every country served before mainnet.

## Product classification

The planned service has two different operating layers:

1. A non-custodial interface that lets a user connect a wallet, review market data, create an order, and sign a transaction locally.
2. A custody-backed bridge that receives transparent ZEC, controls reserve keys, and mints or burns pZEC.

The second layer makes the product custodial. Phlebas must not describe the full service as non-custodial while Phlebas or its contractor controls ZEC reserves, minting, redemption, withdrawal, or recovery keys.

The order book and liquidity pools can also create regulated activity even when users sign transactions themselves. Control over listings, matching, fees, contract upgrades, emergency pauses, routing, or the front end can identify an operator. The [FATF report on decentralized finance dated 21-07-2026](https://www.fatf-gafi.org/content/dam/fatf-gafi/reports/targeted-report-decentralised-finance-2026.pdf.coredownload.pdf) applies a technology-neutral, control-based test to virtual asset service providers.

## Singapore operating perimeter

This plan evaluates Singapore as one candidate operating jurisdiction. The legal entity and place of management remain unresolved.

The [Payment Services Act 2019, First Schedule](https://sso.agc.gov.sg/Act/PSA2019?ProvIds=Sc1-) includes dealing in digital payment tokens, operating a facility where different persons' offers to buy or sell are accepted, transferring tokens, and safeguarding tokens or token instruments where the provider has control. A Phlebas-run order book, reserve wallet, mint controller, or redemption service is likely to require a Payment Services Act licensing analysis.

Serving only users outside Singapore is not an escape route. Part 9 of the [Financial Services and Markets Act 2022](https://sso.agc.gov.sg/Act/FSMA2022) and the [Digital Token Service Providers Regulations 2025](https://sso.agc.gov.sg/SL/FSMA2022-S342-2025?DocDate=20250530) regulate specified digital token services carried on from Singapore for customers outside Singapore. In its [clarification dated 06-06-2025](https://www.sgpc.gov.sg/detail?HomePage=home&page=/detail&url=/media_releases/mas/press_release/P-20250606-2), the Monetary Authority of Singapore said that the licensing threshold is high and that it will generally not issue these licenses.

A licensed Singapore digital payment token custodian must generally return customer assets or place them in a segregated trust account by the next business day. The rules also require customer-level books, daily asset computations, conflict controls, security measures, insolvency disclosures, and at least five years of records. These duties appear in regulations 18A to 18I of the [Payment Services Regulations 2019](https://sso.agc.gov.sg/SL/PSA2019-RG2?ProvIds=P12-P22A-&ValidDate=20251217). Technology controls for covered payment licensees are addressed in [MAS Notice PSN05](https://www.mas.gov.sg/-/media/mas-media-library/regulation/notices/trpd/psn05/psn05-technology-risk-management-notice---6-feb-2024.pdf).

Mainnet remains blocked until Singapore counsel gives a written view on the Payment Services Act, Financial Services and Markets Act, Securities and Futures Act, anti-money laundering rules, sanctions, privacy, and consumer rules. The operating entity must then hold the required licenses or contract with a licensed provider whose duties are stated in writing.

## Country access policy

Access is deny by default. An unresolved country is blocked.

Each approved country must have a dated legal record that states:

- Whether retail users, institutional users, or both may use the service.
- Required licenses, registrations, disclosures, promotions rules, token approvals, and reporting.
- Whether Phlebas may provide custody, exchange, order-book, LP, transfer, and redemption functions.
- Required identity checks, sanctions controls, Travel Rule data, transaction monitoring, record periods, complaint handling, and data location.
- Product restrictions, including leverage, incentives, privacy features, or self-hosted wallet transfers.
- The owner and date of the next review.

Geolocation, wallet screening, contractual terms, and identity checks must enforce the approved list. A disclaimer alone does not establish a country restriction.

### Unresolved direct-contract access gate

Frontend geolocation cannot enforce a country or customer perimeter on a publicly callable ERC-20, settlement contract, or AMM. Mainnet remains blocked until one of two paths has written legal and technical approval: counsel accepts direct public contract access and its geographic scope, or the token, settlement, and pool system enforces an approved onchain eligibility model. Any eligibility mechanism must receive its own security, privacy, censorship, custody, recovery, and composability review. The current simulation chooses neither path and must not claim that Vercel controls direct contract access.

### United States

FinCEN treats an administrator or exchanger that accepts and transmits convertible virtual currency as a money transmitter unless an exemption applies. Its 2019 guidance also addresses owners and operators of decentralized applications that accept and transmit value. See the [2013 FinCEN guidance](https://www.fincen.gov/resources/statutes-regulations/guidance/application-fincens-regulations-persons-administering) and [2019 FinCEN convertible virtual currency guidance](https://www.fincen.gov/sites/default/files/2019-05/FinCEN%20CVC%20Guidance%20FINAL.pdf).

Federal registration does not replace state licensing. New York covers custody, transmission, buying, selling, exchange, and issuing or administering virtual currency under its [virtual currency business rules](https://www.dfs.ny.gov/virtual_currency_businesses). California requires a license for covered digital financial asset business with California residents from 01-07-2026 under its [Digital Financial Assets Law](https://dfpi.ca.gov/regulated-industries/digital-financial-assets/digital-financial-assets-law-frequently-asked-questions/).

ZEC, pZEC, USDC, USDT, and LP tokens each need a securities, commodities, payments, and state coin-listing review. USDT0 is abandoned. A plain 1:1 wrapper does not by itself make a non-security crypto asset a security under the [SEC interpretation dated 17-03-2026](https://www.sec.gov/rules-regulations/2026/03/s7-2026-09), but the underlying asset and the transaction still require classification. Yield promises, reward programs, governance rights, and reliance on managerial work can change the result. Spot virtual currency activity can still face anti-fraud and anti-manipulation enforcement, as described by the [CFTC](https://www.cftc.gov/LearnAndProtect/AdvisoriesAndArticles/understand_risks_of_virtual_currency.html).

The United States stays blocked until federal and state analyses are complete.

### European Union

The [Markets in Crypto-Assets Regulation](https://eur-lex.europa.eu/eli/reg/2023/1114/oj/eng) covers custody, trading platforms, exchange, execution, and transfer services. Its trading platform rules address asset admission, order records, resiliency, public market data, settlement, and market abuse. An operator-controlled protocol does not leave scope merely because a smart contract is used. ZEC's shielded capability needs a specific Article 76 review even if Phlebas credits only a final deposit transaction whose inputs and outputs are transparent.

The [Transfer of Funds Regulation](https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX%3A32023R1113) requires originator and beneficiary information for covered crypto transfers and contains controls for self-hosted addresses.

European Union users stay blocked until authorization, token admission, white paper, custody, Travel Rule, and market-abuse duties are resolved.

### United Kingdom

The United Kingdom financial promotions regime can apply to an overseas firm that markets cryptoassets to United Kingdom consumers through a website or app. The [FCA cryptoassets page](https://www.fca.org.uk/firms/cryptoassets) and [FCA financial promotions letter](https://www.fca.org.uk/publication/correspondence/letter-to-cryptoasset-firms-financial-promotions-regime.pdf) describe the lawful promotion routes and consumer controls.

United Kingdom users and targeted marketing stay blocked until a lawful promotions route and any required registration are in place.

## Zcash deposit and custody requirements

Phlebas v1 credits only the final deposit transaction when every input and output in that transaction is transparent. A wallet may construct an earlier ephemeral unshielding transaction before its final TEX payment. That earlier transaction is not the credited deposit. A [TEX address under ZIP 320](https://zips.z.cash/zip-0320) asks conforming senders to use transparent inputs, but wallet policy rather than Zcash consensus enforces the restriction. This final-transaction rule does not prove lifetime provenance.

The bridge must:

- Assign a fresh, single-use TEX deposit address to each deposit intent and never reassign it.
- Inspect every input and output in the final transaction before minting.
- Reject or quarantine a final deposit transaction with any shielded component, nontransparent output, or unresolved best-chain status.
- Wait for the approved confirmation count and handle reorganizations before final minting.
- Maintain a customer-level reserve liability for every pZEC unit.
- Define forks, dust, fees, lost funds, redemption delays, emergency pauses, and failed redemptions in the customer terms.
- Disclose that transparent Zcash activity exposes sender, receiver, amount, and transaction history. The [Zcash address documentation](https://zcash.readthedocs.io/en/latest/rtd_pages/addresses.html) explains the difference between transparent and shielded addresses.

No shielded ZEC support is allowed in v1.

## Stablecoin listing policy

### USDC first

USDC is the first production quote asset, subject to every mainnet gate.

Phlebas must use the issuer-native contract on a chain listed in [Circle's supported chains and currencies](https://developers.circle.com/circle-mint/supported-chains-and-currencies). It must not create a Phlebas-wrapped USDC or accept an unsupported bridge representation. The interface must identify the chain and contract address and disclose issuer freeze, blacklist, depeg, and redemption risk. Phlebas must not imply that Circle sponsors the product or that Phlebas can redeem USDC with Circle. The [Circle USDC terms](https://www.circle.com/legal/usdc-terms) govern issuer access and restrictions.

### Native USDT

Native USDT is a listed quote in this simulation. USDT0 is abandoned and is not a later listing gate.

Mainnet USDT, if ever approved, must be issuer-native USDT on the chosen chain. Phlebas must not list USDT0 or a Phlebas-wrapped USDT. Counsel must still approve the asset, customer disclosures, and country availability. The team reviews the current [Tether terms](https://tether.to/en/legal/) and obtains written advice on restrictions that apply to the eventual entity, management, and customer facts. Singapore-person restrictions are reviewed only if those facts make them applicable. Sanctions, blacklist, freeze, depeg, and upgrade events need automated trading and deposit controls. Phlebas does not provide direct issuer redemption.

## Anti-money laundering and sanctions controls

Before real value is accepted, the licensed operator must implement:

- Customer and business verification, beneficial-owner checks, and age or eligibility controls.
- Politically exposed person and sanctions screening at onboarding and on an ongoing basis.
- Source-of-funds and source-of-wealth escalation rules.
- Zcash transparent-chain and EVM transaction monitoring.
- Wallet risk scoring without treating one vendor score as conclusive.
- Travel Rule collection and transmission where required.
- Suspicious activity investigation, reporting, restricted-account, blocked-property, and law-enforcement procedures.
- Record retention and access controls set by each approved country.

The [OFAC virtual currency guidance](https://ofac.treasury.gov/system/files/126/virtual_currency_guidance_brochure.pdf) calls for a risk-based sanctions program, screening, transaction monitoring, and review of prior activity. Geoblocking does not replace sanctions controls.

## Market integrity requirements

The order book must use documented, deterministic price-time priority. Production controls must include:

- Self-trade prevention.
- Cancel-on-disconnect and stale-order handling.
- Price collars, size limits, fat-finger checks, and rate limits.
- Wash-trading, spoofing, layering, marking, and manipulation alerts.
- Append-only order, cancellation, fill, account, and administrative-action logs.
- Synchronized clocks and a stated record-retention period.
- Conflict disclosures for affiliates and market makers.
- No operator own-account trading on the venue unless counsel confirms it is permitted and controls are approved.
- Public pre-trade and post-trade data where required.

LP pools need separate monitoring for manipulation between the pool and order book, stale or manipulated reference prices, sandwich attacks, toxic flow, and reserve imbalance.

## Consumer and product requirements

The interface and customer terms must state, in plain language:

- Every fee, spread, slippage rule, minimum, confirmation period, and redemption condition.
- pZEC custody, reserve, insolvency, smart-contract, key-loss, pause, and fork risk.
- USDC and USDT issuer, blacklist, freeze, depeg, and chain risk. USDT0 is abandoned.
- Order-book depth, partial-fill, cancellation, settlement, outage, and finality rules.
- LP price risk, impermanent loss, fee variability, smart-contract risk, and withdrawal conditions.
- The public nature of transparent ZEC transactions.
- Complaint, error, support, data-use, and incident-notification procedures.

Phlebas must not promise a stable return, principal protection, privacy, guaranteed liquidity, guaranteed redemption timing, or regulatory approval.

## Vercel boundary

Vercel may host the public Next.js interface, documentation, local EVM-wallet connection and transaction signing for Arbitrum testnet, read-only market data, testnet controls, and non-authoritative API proxies. Native Zcash remains a ZIP 321 or TEX QR, deep-link, or copy handoff followed by independent chain observation; Vercel does not connect to or proxy the Zcash wallet.

Vercel must not hold or run:

- Zcash reserve keys, EVM mint or burn keys, bridge administrator keys, MPC shares, recovery material, or user seed phrases.
- Zcash nodes, deposit confirmation workers, reorganization handling, mint signers, hot wallets, or withdrawal coordinators.
- The customer custody ledger, proof-of-liabilities database, or authoritative reserve reconciliation.
- KYC documents, Travel Rule payloads, sanctions case files, or suspicious activity records.
- The authoritative matching engine or market-surveillance ledger.

Those services require isolated, durable infrastructure with HSM or MPC custody, persistent databases, private networking, audited access, segregation of duties, monitored workers, and tested recovery. Vercel environment variables are not a custody key store. The [Vercel shared responsibility model](https://vercel.com/docs/security/shared-responsibility), [Functions documentation](https://vercel.com/docs/functions), and [sensitive environment variable documentation](https://vercel.com/docs/environment-variables/sensitive-environment-variables) define the relevant platform boundary.

## Mainnet legal stop condition

Mainnet is blocked until every requirement in [LAUNCH_PLAN.md](./LAUNCH_PLAN.md#mainnet-go-or-no-go-gate) has written evidence and the designated approvers record a go decision. A failed, expired, or unresolved gate is a no-go.
