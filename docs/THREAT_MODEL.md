# Phlebas Threat Model

Status: native atomic-settlement threat model, no-value implementation

The active target is [ADR 0002](adr/0002-native-zec-atomic-settlement.md): native transparent ZEC remains on Zcash, the exact stablecoin remains on its EVM chain, and one two-chain atomic swap settles each fill. Phlebas cannot sign, claim, refund, redirect, or custody either leg.

> Status as of 01-09-2026: design document and key-independent reference domain for a no-value simulation with undeployed Sepolia contract sources and optional local textest services. No production contract, native transaction path, wallet execution, matching, routing, monitoring, or incident control is deployed or audited.

The active native-swap reference accepts only a zero protocol fee. Fee recipient and cap fields remain digest-bound, but a positive fee is rejected until the exact EVM escrow route can prove principal delivery and fee accounting separately. Fee proposals in the superseded pZEC design below are not active native-settlement behavior.

## Active native-settlement threats

| Threat | Failure | Required control |
| --- | --- | --- |
| Terms substitution | A party funds different assets, amounts, recipients, hashes, deadlines, or contracts | Both parties authorize one canonical per-fill terms digest; wallets independently review exact transaction bytes |
| Noncausal history | Forged persistence claims funding or spending before its required authorization, artifact, or confirmed predecessor | Root authorization and preparation times; reject every chain fact that predates its causal prerequisite |
| Funding-order violation | Stablecoin is locked before the ZEC leg has approved confidence | EVM funding is disabled until exact ZEC funding evidence is confirmed under the signed policy |
| Unsafe timeout margin | One party lacks enough time to claim or refund across chains | Strictly ordered cutoffs, a versioned minimum safety window, chain-time checks, and Testnet approval of production durations |
| False secret evidence | Mempool calldata, a failed EVM call, or one observer report is treated as claim authority | A successful canonical claim fact may record the observed preimage, but only signed-policy quorum and finality create confirmed claim authority; the preimage must match SHA-256 |
| Reveal reorganization | The EVM claim leaves the best chain after exposing the preimage | Secret knowledge is monotonic, confirmed authority is invalidated by dispute, and normal signing recommendations stop |
| Claim and refund race | Competing branches spend the same lock | Per-leg terminal outcomes are mutually exclusive; eligibility is not finality; observers track the exact outpoint or contract slot |
| Observer compromise or staleness | Wrong-chain, wrong-asset, stale, or conflicting evidence advances the swap | Content-addressed facts, exact outpoint or escrow binding, signed source allowlist, source quorum, confirmation depth, execution age, freshness, and fail-closed dispute state |
| Replacement ambiguity | A replacement changes the accepted chain fact or erases its history | Replacement is limited to a retracted unconfirmed attestation for the same canonical fact; retraction and resolution records remain rooted and replayable |
| Journal rollback or corruption | Restart loses, rewrites, or invents an accepted event | Strict event kinds and fields, hash-chained receipts, semantic replay, prior and next state roots, and complete snapshot roots are required |
| Unsafe expiry | A coordinator discards an active or funded swap | Expiry requires the active signed deadline and no observed chain evidence; funded swaps remain in claim or refund recovery |
| Wallet adapter mismatch | A wallet signs bytes that differ from the reviewed artifact | Adapter and release allowlists, explicit inspection, executed compatibility tests, and no compatibility claim before evidence |
| Stablecoin controls | Issuer pause, blacklist, upgrade, or token mismatch freezes a leg | Exact token and contract identity, affected-market stop, issuer-state monitoring, and no USDT/USDT0 substitution |
| Transparent-chain privacy | Cross-chain addresses and timing link the parties | Persistent public-linkability warning; no privacy or shielded-settlement claim |

The reference implementation rejects unsafe transitions without mutating accepted state. A refund deadline only makes a branch eligible; it does not prove the lock remains unspent or that the refund confirmed. The coordinator may recommend a wallet action, but every spend remains unilateral and wallet-controlled.

Before any Testnet wallet action, Phlebas still needs exact Zcash script and PCZT execution, exact EVM escrow code, chain-specific finality policies, observer recovery, wallet compatibility, and adversarial timeout and reorganization evidence. Before Mainnet it additionally needs independent audits, legal approval, production identities, monitoring, incident drills, and separate real-asset authorization.

## Legacy ADR 0001 threat model

The pZEC gateway, reserve, mint, burn, passive AMM, and custody analysis below is retained as historical simulation evidence. It does not define the production target.

## 1. Legacy purpose and decision

Phlebas is intended to become a hybrid exchange for two markets:

- `ZEC-USDC`
- `ZEC-USDT`

The design combines an offchain central limit order book, onchain atomic settlement, and two constrained Uniswap v2-style liquidity pools. Transparent ZEC enters through a federated gateway and is represented on Arbitrum One as tZEC.

The design is acceptable only for simulation, testnet, and a later strictly capped beta. The tZEC gateway is the dominant risk. Phlebas must not be described as fully decentralized, trustless, shielded, private, or live native-ZEC execution. Product labels may say native ZEC against native USDC and native USDT. USDT0 is abandoned.

## 2. Current repository reality

The public Vercel app is a no-value simulation. Local optional stubs exist and are not production:

- In-browser session matcher, plus a loopback matcher operator that is never hosted on Vercel.
- Undeployed Arbitrum Sepolia contract sources. The manifest stays `deployed: false` until a real Sepolia transaction is recorded.
- Optional EIP-1193 wallet connection on Arbitrum Sepolia only. Signing stays disabled while the verified deployment manifest is undeployed.
- Local `textest` gateway and observer stubs on `127.0.0.1`. No Zebra RPC, no mainnet TEX.

Values shown for prices, depth, volume, total value locked, pool reserves, fees, and trades are simulation data. They are not evidence of a live market or asset backing. Do not set `PHLEBAS_GATEWAY_URL` or `PHLEBAS_MATCHER_URL` on Vercel.

## 3. Proposed architecture

```text
Transparent ZEC deposit
  -> independent Zebra node quorum
  -> threshold deposit attestation
  -> tZEC mint on Arbitrum One
  -> user wallet
       -> signed order -> offchain CLOB -> onchain settlement
       -> ZEC/USDC pool
       -> ZEC/USDT pool
       -> atomic route across CLOB and AMM

tZEC redemption request
  -> destination and amount validation
  -> finalized tZEC burn
  -> Arbitrum finality policy
  -> native payout liability recorded
  -> threshold transparent ZEC payout
  -> native payout confirmation
  -> payout liability closed
```

### 3.1 Proposed components

| Component | Function | Trust or failure boundary |
| --- | --- | --- |
| Web interface | Quotes, order entry, pool views, gateway status | Vercel, DNS, release, and dependency compromise can mislead or censor users |
| Order API | Receives signed orders and publishes order-book data | Can censor, omit, delay, or leak orders |
| Matcher | Applies price-time priority and proposes fills | Can reorder, selectively match, capture timing advantages, or stop |
| Settlement contract | Validates orders and moves exact tokens atomically | Contract correctness, signature handling, token behavior, and Arbitrum availability |
| Route executor | Combines signed CLOB fills and AMM swaps | Route authorization, residual balances, slippage, deadline, and reentrancy |
| AMM factory and pairs | Holds LP funds and enforces constant-product swaps | Contract defects, thin liquidity, toxic flow, token controls, and LP loss |
| tZEC token | Represents a claim on transparent ZEC | Gateway solvency, mint authority, and redemption availability |
| Gateway controller | Registers deposits, mints, validates finalized burns, and tracks redemptions | Attester collusion, replay, state-machine defects, and admin abuse |
| ZEC custody | Controls reserve UTXOs and makes payouts | Key compromise, signer collusion, loss, censorship, and operational failure |
| Zebra quorum | Observes Zcash chain state and confirmations | Node compromise, stale state, consensus split, and reorganization |
| Reserve registry | Publishes assets, liabilities, and freshness | Omitted liabilities, stale snapshots, false attestations, and monitor outage |
| Governance timelock | Changes narrow parameters and signer membership | Governance capture, role error, delay bypass, and loss of quorum |

Vercel may host only the public interface and read APIs. Matcher, WebSocket, Zebra, reserve, custody, attester, governance, and deployment secrets must be isolated from Vercel and from the public repository.

## 4. Network and asset constants

The proposed settlement network is Arbitrum One, chain ID `42161`. Its official documentation identifies it as a Nitro Rollup over Ethereum and distinguishes sequencer acceptance from parent-chain posting and rollup finality. The current force-inclusion period is 24 hours and the dispute window is approximately 6.4 days. These values must be revalidated before deployment.

Only exact, revalidated token addresses may be enabled:

| Asset | Proposed address or rule | Decimals |
| --- | --- | --- |
| tZEC | New Phlebas contract, address not assigned | 8 |
| Native USDC on Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | 6 |
| Native USDT on Arbitrum | Address not assigned. USDT0 is abandoned. Reverify issuer-native USDT at the mainnet gate. | 6 |
| LP tokens | One token per constrained pair | 18 |

Reject bridged USDC variants, lookalike tokens, arbitrary pairs, rebasing tokens, and fee-on-transfer tokens. Token address, code hash, decimals, symbol, issuer documentation, and runtime behavior must be checked again at the release gate.

The canonical API and contract market names are `ZEC-USDC` and `ZEC-USDT`. Those pairs are native ZEC against native USDC or native USDT. USDT0 is abandoned. The interface remains a no-value simulation and must not claim live funds.

## 5. Assets and security objectives

### 5.1 Assets to protect

- Transparent ZEC reserve UTXOs.
- tZEC mint and burn authority.
- User ZEC, USDC, USDT, and LP positions. The undeployed receipt symbol is `tZEC`. Product labels native ZEC. ADR 0001 historically named this `pZEC`.
- Signed orders, nonces, allowances, limits, and cancellation state.
- Matcher sequence records and fill submissions.
- Attester, custody, guardian, governance, deployer, and treasury keys.
- Reserve and liability records.
- Contract source, reviewed commit, deployment inputs, and bytecode identity.
- Release pipeline, domain, frontend, RPC endpoints, and dependency integrity.

### 5.2 Security objectives

1. No tZEC is minted without one mature, unique, controlled transparent ZEC deposit.
2. Confirmed controlled reserve plus separately reported, exact claim-matched in-transit principal cover all gateway liabilities plus the required buffer. In-transit principal is not reusable reserve, and unconfirmed change never counts toward coverage.
3. No order settles above a buyer's limit or below a seller's limit.
4. No order is replayed, overfilled, double-filled, or charged above its signed fee cap.
5. No route spends more than `maxIn`, returns less than `minOut`, executes after its deadline, or changes its signed recipient or venues.
6. No AMM swap violates its fee-adjusted constant-product invariant.
7. No administrator can seize user assets, arbitrarily mint tZEC, bypass a timelock, or replace contract logic in place.
8. Emergency action stops new risk while preserving cancellation, allowance revocation, and LP removal where the underlying token permits them.
9. Soft L2 confirmation is never represented as Ethereum posting or rollup finality.
10. The interface cannot make simulated values appear to be live or backed.

## 6. Trust assumptions and decentralization limits

Phlebas depends on the following trusted or governed parties:

- The transparent ZEC custody quorum can move reserve assets and censor redemptions.
- The attester quorum can approve deposits and payout observations. A colluding quorum can create unbacked tZEC or falsely finalize a payout unless additional proof systems are implemented.
- The matcher controls availability and practical order priority. Publishing sequence roots makes behavior auditable but does not enforce fairness onchain.
- Arbitrum sequencing and governance affect ordering, availability, finality, and contract execution.
- Circle controls USDC minting, pausing, blacklisting, and upgrades.
- Native USDT depends on Tether issuer, blacklist, freeze, and contract controls. USDT0 is abandoned and is not a listed quote.
- Vercel and the domain provider can censor or replace one interface.

Accurate claim: Phlebas is planned as a hybrid exchange with onchain settlement and constrained AMM contracts. Whether mainnet contracts may be called without an approved eligibility mechanism remains unresolved.

Inaccurate claims:

- Fully decentralized exchange.
- Trustless ZEC bridge.
- Native ZEC settlement on Arbitrum.
- Shielded or private trading.
- MEV-free or censorship-resistant order matching.
- Audited, deployed, solvent, or production ready.

## 7. tZEC gateway

### 7.1 Transparent-only boundary

The gateway accepts assigned Zcash transparent addresses. Transparent addresses and amounts are public. Phlebas does not preserve Zcash shielded privacy after gateway entry, and all Arbitrum activity is public.

As of 30-08-2026, `zcashd` is end-of-life and does not support NU6.3. A future gateway must use currently supported Zebra releases and a separately secured transaction construction and signing service. Run at least three geographically and provider-independent Zebra nodes. Require agreement on network, settled upgrade, tip hash, chainwork, transaction, output, and maturity.

### 7.2 Deposit state machine

1. The gateway reserves an assigned transparent address and binds it to an EVM destination.
2. Independent Zebra observers identify the exact `txid`, output index, address, and zatoshi amount.
3. The deposit waits for the active confirmation rule.
4. A threshold attestation binds the deposit outpoint, amount, destination, Zcash height, tip hash, and chainwork.
5. The gateway consumes the deposit ID once and mints the exact tZEC amount.
6. Any disagreement, stale node, reorganization, duplicate outpoint, or amount mismatch stops minting.

The initial security policy should require 100 confirmations and at least two hours, whichever is later. This is a design recommendation, not a claim of assured finality. The policy must account for cumulative work and wall-clock time because Zcash block spacing may change.

### 7.3 Redemption state machine

1. The user requests a transparent ZEC payout and sees the exact destination, gross amount, fees, and minimum native output.
2. The destination, amount, limits, and policy result are validated before any irreversible action.
3. The user burns tZEC. The first implementation does not create a payout liability from escrowed tokens.
4. The gateway waits for the applicable Arbitrum finality tier, consumes the burn event once, and records an equal pending native payout liability.
5. Only then may the custody quorum commit, sign, and broadcast the exact ZEC transaction.
6. Independent observers confirm the native payout, then the gateway clears the matching payout liability. If the payout is reorganized or fails after broadcast, the liability remains open. The coordinator may rebroadcast only the exact committed bytes. It may create a replacement only after independent proof that the original cannot confirm and its selected inputs are spendable and re-reserved under a new unique transaction record.
7. An unrecoverable pre-signature failure may restore tZEC only through a single-use refund authorization that permanently cancels the payout claim. Once signed, the claim remains payable. A claim can never be both refunded and paid.

Small payouts may use Ethereum-posted and Ethereum-finalized L2 state only within a strict daily loss cap. Large payouts should wait for full rollup finality. The exact thresholds and service targets require explicit risk-budget approval before any beta.

### 7.4 Committees and limits

- Proposed deposit and payout attesters: 4-of-7 independent organizations.
- Proposed transparent ZEC custody: 5-of-7 independently held keys.
- Attester and custody keys are separate, hardware-protected, geographically distributed, and never stored in Vercel, CI, source control, or general application hosts.
- Minting has per-deposit, per-day, and total-supply caps.
- Signer rotation is timelocked. A guardian may pause a compromised path but cannot add a signer or mint.
- Reserve ZEC is never lent, staked, rehypothecated, pledged, or used for operating expenses.

These thresholds reduce single-key risk but do not make the gateway trustless.

## 8. Reserve and liability accounting

All accounting uses integer zatoshis. `1 ZEC = 100,000,000 zatoshis`, so tZEC uses 8 decimals.

Define:

```text
A = confirmed transparent ZEC in controlled, spendable, and uncommitted UTXOs

L = tZEC totalSupply
  + registered refundable deposits not yet minted
  + burned payout claims not yet confirmed paid

T = customer payout principal in a valid signed, broadcast, or mined transaction,
    matched one-to-one to the same burned payout claim in L

C = change to an approved custody script in a signed, broadcast, mined, or
    unresolved committed transaction;
    it is excluded from coverage until confirmed and spendable

U = principal in an invalid, stale, conflicted, or reorganized committed
    transaction; it is excluded from coverage and forces incident halt

I = full selected custody input value
P = customer payout principal and exact matching increase in T
N = network fee

B = required operator-funded buffer, at least 1 percent of L under the canary design
```

Let `W` be the burned payout-claim portion of `L`. The core invariants are:

```text
0 <= T <= W
A >= (L - T) + B
A + T >= L + B
I = P + C + N
```

State transitions must avoid double counting:

- Before a finalized burn, a reversible redemption request leaves tZEC user-controlled and in `tZEC totalSupply`; it creates no pending payout liability.
- A finalized burn reduces `tZEC totalSupply` and creates an exactly equal pending payout liability.
- At transaction commitment, the full selected input `I` leaves `A`, exact principal `P` enters only its matching `T`, change enters `C` with a 100 percent coverage haircut, and `N` is recognized under the approved fee policy.
- `T` cannot cover token supply, refundable deposits, the buffer, another payout, fees, or any unmatched obligation.
- `C` is tracked for attribution but cannot satisfy either coverage inequality before it is confirmed and spendable.
- After confirmed native payment, confirmed change moves from `C` to `A`, and both `T` and the matching payout liability decrease by exact principal `P`.
- An unminted controlled deposit remains a refundable liability until minted or refunded.
- Operator fees and user liabilities are recorded separately.
- Before signing a native payout, the gateway removes full `I` from simulated `A` and refuses to sign unless `I = P + C + N`, `0 <= T <= W`, `A >= (L - T) + B`, and `A + T >= L + B` all remain true. Eventual change cannot rescue the pre-sign check.
- An invalid, stale, conflicted, reorganized, or unmatched transaction moves its principal from `T` to excluded `U` immediately. Full `I` returns to `A`, and its `P`, `C`, and `N` entries reverse, only after independent observers prove the custody inputs are spendable again and the transaction cannot confirm. Otherwise the bridge remains in incident halt.

Publish a reproducible reserve snapshot at least every 10 minutes and after every reserve movement. It should include the Zcash tip, UTXO root, `A`, `T`, excluded `U`, excluded `C`, each liability class, tZEC supply, and buffer. Publish both controlled coverage `A / (L - T + B)` and total matched coverage `(A + T) / (L + B)`, including each numerator and denominator. Label `T` as non-reusable settlement in transit and never present `A / L` as the governing solvency ratio. Independent watchers must be able to rebuild the result from Zebra and Arbitrum.

Proof of reserves is a monitoring control. It does not prove that signers cannot collude, that keys are recoverable, or that no legal encumbrance or omitted offchain liability exists.

## 9. Hybrid central limit order book

### 9.1 Signed order

Use EIP-712 typed orders with an explicit domain containing chain ID, verifying contract, and version. Each order binds:

- Maker and authorized signer.
- Sell token and buy token.
- Side and market.
- Base amount and limit price.
- Filled amount rule.
- Nonce, account nonce epoch, salt, and expiry.
- Recipient.
- Order type.
- Maximum fee basis points.
- Optional route restrictions.

Support ERC-1271 contract wallets. Reject malformed, malleable, expired, canceled, replayed, overfilled, or wrong-domain signatures.

### 9.2 Settlement

The proposed v1 settlement contract moves exact amounts directly between wallets using explicit approvals or permits. It does not hold an omnibus CLOB balance. A standing order may become unfillable if a maker changes its balance or allowance, which is a liveness failure rather than permission to take other assets.

Use integer arithmetic and full-width multiplication and division. The contract must apply side-aware rounding that never worsens a signed limit. Canonical price units are quote micro-units per `100,000,000` tZEC atoms.

Proposed initial fees are 5 basis points for makers and 15 basis points for takers, paid in the quote asset. Each side signs a maximum fee. The contract enforces an immutable ceiling of 30 basis points per side. Negative maker fees and rebates are out of scope for v1.

A market order is implemented as an immediate-or-cancel limit order with a user-defined worst price. Unbounded market orders are forbidden.

### 9.3 Matcher limits

The matcher may apply maker-price execution and price-time priority, but an onchain settlement contract cannot prove the matcher's offchain arrival order. The service should issue signed receipt timestamps and publish append-only sequence commitments. These records support audit and dispute analysis but do not prevent censorship, leakage, selective matching, or reordering.

Anyone with two compatible valid orders may relay a valid fill if the protocol exposes the orders. The primary matcher remains an availability and information boundary.

## 10. Constrained Uniswap v2-style AMM

The proposed factory creates exactly two pairs:

- ZEC/USDC
- ZEC/USDT

No arbitrary pair creation, dynamic fee, farm, gauge, lending adapter, leverage, flash swap, or callback is included in v1.

Each pair supports proportional liquidity minting and burning, swaps, and LP permits. LP tokens use 18 decimals. The swap fee is fixed at 30 basis points and accrues entirely to LPs. The protocol fee is off.

For input amounts `amount0In` and `amount1In`, the fee-adjusted invariant is equivalent to:

```text
(balance0 * 10,000 - amount0In * 30)
* (balance1 * 10,000 - amount1In * 30)
>= reserve0 * reserve1 * 10,000^2
```

The implementation must handle first liquidity, minimum locked liquidity, rounding, dust, direct token donations, reserve synchronization, overflow, zero amounts, and token transfer failures. The pair rejects unsupported token behavior by constraining exact token addresses rather than attempting to support every ERC-20 variant.

LPs face impermanent loss, thin-liquidity manipulation, adverse selection, tZEC depeg and custody risk, stablecoin depeg and issuer-control risk, smart-contract risk, and the possibility that a stablecoin issuer freezes the pool address.

## 11. Routing and oracle policy

A stateless route executor may combine signed CLOB fills and one constrained AMM swap in one Arbitrum transaction. The user signs:

- Input token and maximum input.
- Output token and minimum output.
- Allowed venues and pair.
- Deadline.
- Final recipient.
- Any permitted partial-fill rule.

The transaction reverts if any order becomes invalid or the aggregate protection fails. The executor must return all residual assets to the signed recipient and must not retain balances between routes.

No oracle controls matching, settlement, AMM execution, tZEC minting, or redemption. Signed limits, `maxIn`, `minOut`, exact pair addresses, and deadlines are authoritative.

AMM cumulative prices and independent multi-venue observations may support monitoring or interface warnings. They must not create an onchain liquidation, solvency, or settlement dependency. An AMM spot price is never a trusted oracle.

## 12. Administration and upgrade model

### 12.1 Roles

| Role | Proposed threshold | May do | Must not do |
| --- | --- | --- | --- |
| Emergency guardian | 2-of-3 | Pause new tZEC mints, CLOB fills, and route execution | Unpause, seize, mint, spend reserves, change fees, rotate signers, or upgrade |
| Governance | 4-of-7 behind 7-day timelock | Rotate signer sets, change narrow parameters inside immutable caps, and unpause after remediation | Bypass delay, seize assets, or replace logic in place |
| Custody quorum | 5-of-7 | Spend exact reserve transactions under policy | Mint tZEC or change protocol parameters |
| Attester quorum | 4-of-7 | Attest mature deposits and confirmed payouts | Spend reserves, change caps, or upgrade |
| Treasury | Separate receiver | Receive disclosed protocol fees | Pull user funds or reserve backing |

The deployer relinquishes privileged access after roles and delays are verified.

### 12.2 Versioning

tZEC logic, settlement, route execution, AMM factory, and AMM pairs should be non-upgradeable. A material logic change deploys a new version with a new EIP-712 domain and explicit user migration. Existing signed orders cannot replay into a new settlement version.

The gateway may change signer membership and bounded risk parameters through the timelock, but not replace its logic through a proxy. A gateway logic defect requires mint pause, a new token or controller design, independent review, and explicit migration.

Stablecoin contracts remain outside Phlebas control. Circle documents pause, blacklist, mint, and upgrade roles for USDC. Native USDT remains subject to Tether issuer and contract controls. Phlebas must isolate an affected market and disclose the dependency rather than claiming immutable stablecoin settlement. USDT0 is abandoned.

## 13. Threats and required controls

| Threat | Impact | Required control |
| --- | --- | --- |
| Custody quorum compromise | Reserve theft and tZEC insolvency | Independent hardware-held keys, 5-of-7 threshold, exact transaction review, limits, movement alerts, and recovery drills |
| Attester quorum compromise | Fake mint or false payout finalization | Independent 4-of-7 quorum, unique outpoint registry, mint caps, public attestations, reserve watchers, and immediate mint pause |
| Zcash reorganization | Minted tZEC loses native backing | Conservative maturity, chainwork and wall-clock policy, independent Zebra agreement, reorg monitor, buffer, and mint stop |
| Zebra node compromise or staleness | False deposit or payout observation | Three or more isolated nodes, tip comparison, settled-upgrade check, freshness limits, and no single RPC authority |
| Order replay or signature confusion | Unauthorized settlement | EIP-712 domain separation, chain ID, contract version, nonce bitmap, account epoch, expiry, salt, and ERC-1271 validation |
| Matcher censorship or reordering | Unfair or unavailable market | Signed receipts, sequence commitments, public cancellation, alternate relaying, allowance revocation, and honest disclosure |
| Decimal or rounding error | Limit violation or value creation | Integer atomic units, full-width arithmetic, side-aware rounding, differential tests, and minimum trade size |
| Settlement reentrancy or token anomaly | Asset loss or accounting corruption | Exact-token allowlist, safe transfers, checks-effects-interactions, reentrancy guard, no callbacks, and balance-delta tests |
| AMM invariant defect | Pool drain | Minimal constrained code, fixed fee, invariant fuzzing, differential testing, independent review, and capped launch |
| Route substitution or residual balance | Excess spend or stolen output | Signed venues and recipient, `maxIn`, `minOut`, deadline, atomic revert, and zero-residual invariant |
| Stablecoin pause, blacklist, upgrade, or depeg | Frozen pool or failed settlement | Exact market isolation, live issuer-state monitoring, no cross-market shared vault, and affected-market stop |
| Arbitrum sequencer or finality failure | Delayed or reversed expected state | Distinct status labels, L1 posting checks, finality tiers, force-inclusion awareness, and delayed native payouts |
| Admin or timelock capture | Parameter abuse or denial of service | Narrow roles, immutable caps, self-administered timelock, independent signers, public queue, and no proxy upgrade |
| Frontend or dependency compromise | Phishing, wrong addresses, or false quotes | Reproducible builds, content security policy, dependency pinning, signed releases, address verification, and alternate access |
| Reserve report omission or staleness | Hidden insolvency | Onchain liabilities where possible, public UTXOs, frequent snapshots, independent reconstruction, and staleness stop |
| Thin liquidity and toxic flow | Extreme slippage and LP loss | User limits, depth warnings, capped beta, no unbounded market order, and no unsupported liquidity claims |

## 14. Incident stops and kill gates

These are proposed controls. They are not active in the current simulation.

### 14.1 Automatic or immediate stops

Pause new tZEC minting when any condition occurs:

- Reserve snapshot is older than 15 minutes.
- An unexplained reserve UTXO spend is observed.
- `A < (L - T) + B` for the current claim-matched state.
- `A + T < L + B`, or any `T` is stale, invalid, conflicted, or unmatched.
- Zebra nodes disagree on relevant chain state.
- A reorganization reaches the active confirmation threshold.
- A custody, attester, deployer, release, or governance key may be compromised.

Pause new CLOB fills and route execution when any condition occurs:

- Token conservation differs by one atomic unit.
- A signature, nonce, rounding, fee, or limit invariant fails.
- A Critical contract exploit is suspected or confirmed.
- Arbitrum state is not posted to Ethereum within the published release threshold.
- The affected stablecoin is paused, the protocol address is blacklisted, or a sustained depeg exceeds 3 percent for 15 minutes.

Do not stop user cancellation or allowance revocation. Do not stop LP removal through a Phlebas role. An external stablecoin pause or blacklist can still make removal impossible, which Phlebas cannot override.

Stop accepting new gateway deposits when an eligible routine redemption remains unpaid for more than two hours. Escalate to a full incident if it remains unpaid for 24 hours.

### 14.2 Prelaunch kill gates

Do not accept public funds unless all are true:

1. The exact custody and attester organizations are known and independently controlled.
2. The reserve and liability monitor is public and independently reproducible.
3. Redemption terms, fee treatment, incident authority, and legal custody basis are explicit.
4. Every core invariant has deterministic, fuzz, and state-machine coverage.
5. Independent gateway and Solidity reviews cover the exact release.
6. No Critical or High finding remains unresolved.
7. Deployment bytecode, arguments, roles, delays, and addresses match the reviewed commit.
8. Key-loss, reorganization, signer-compromise, stablecoin, Arbitrum, and frontend outage drills pass.
9. The testnet and capped-beta risk budgets are approved.

Permanently abandon or migrate an affected version after reserve theft, quorum collusion, an unrecoverable deficit, repeated High incidents, a timelock bypass, or loss of a lawful operating basis.

## 15. Required verification

### 15.1 Gateway and accounting

- Unique mature outpoint per mint.
- Exact zatoshi-to-tZEC conversion.
- Deposit replay and cross-destination replay rejection.
- Reorganization before and after attestation.
- Request, rejection before burn, mint, finalized burn, single-use pre-signature refund, payout, and payout-failure state transitions.
- Full-input removal at signature commitment, exact `I = P + C + N`, per-claim in-transit matching, and a 100 percent haircut on unconfirmed change.
- Crash and restart between signing and broadcast, input-reservation persistence, exact-byte rebroadcast, transaction expiry, and proof-gated reversal.
- Append-only transaction-ID uniqueness across active, restored, and closed claims.
- Signed, broadcast, mined, confirmed, unresolved, conflicted, and reorganized transitions with `U` excluded, incident halt enforced, `0 <= T <= W`, `A >= (L - T) + B`, and `A + T >= L + B` after every valid transition.
- No double counting of token supply, burn-created payout liabilities, or claim-matched in-transit principal.
- Signer loss, conflicting attestation, delayed payout, and reserve movement drills.

### 15.2 CLOB and settlement

- Replay rejection across chain, contract, version, nonce, epoch, salt, and expiry.
- ECDSA malleability and ERC-1271 edge cases.
- Partial fill, concurrent fill, cancel-fill race, balance change, and allowance revocation.
- Buyer and seller limit preservation under every rounding direction.
- Fee conservation and signed fee-cap enforcement.
- Bounded batch size and gas-denial behavior.
- Direct transfer failures and malicious token return values.

### 15.3 AMM and routing

- Fee-adjusted constant product never decreases after a valid swap.
- LP mint and burn remain proportional within documented rounding.
- First liquidity, minimum liquidity, dust, donation, reserve drift, and zero-liquidity behavior.
- Differential tests against the pinned Uniswap v2 reference where applicable.
- No callback or unsupported-token path.
- Atomic split route, stale order, changed reserve, slippage, deadline, and recipient substitution.
- Route executor retains no residual token balance.

### 15.4 Administration and operations

- Guardian can pause only authorized entry points.
- Governance cannot bypass the 7-day delay or immutable caps.
- Deployer has no residual role.
- Role loss and threshold recovery drills.
- Reproducible build and exact deployed-bytecode verification.
- Vercel, DNS, matcher, WebSocket, RPC, Zebra, stablecoin, and Arbitrum outage exercises.

Two independent reviews are required before public funds: one for the Zcash gateway, custody, and accounting state machine, and a separate review for settlement, routing, token, and AMM contracts. The exact deployed release must be reviewed again after every material change.

No such review or deployment is claimed here.

## 16. Out of scope for the first implementation

- Shielded ZEC deposits or withdrawals.
- A trust-minimized Zcash light client on Arbitrum.
- Margin, leverage, lending, liquidation, derivatives, or credit.
- Governance token, liquidity mining, rebates, or yield promises.
- Permissionless pair creation or arbitrary token listings.
- Flash swaps, callbacks, hooks, dynamic fees, or upgradeable pool logic.
- Cross-chain routing beyond the defined ZEC gateway and selected Arbitrum assets.
- Onchain price-dependent solvency or liquidation logic.
- Claims of privacy, anonymity, assured execution, or guaranteed redemption time.

## 17. Primary references

- [Arbitrum chain information](https://docs.arbitrum.io/for-devs/dev-tools-and-resources/chain-info)
- [Circle USDC contract addresses](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Circle FiatToken design](https://github.com/circlefin/stablecoin-evm/blob/master/doc/tokendesign.md)
- [Tether legal](https://tether.to/en/legal/)
- USDT0 sources are retained only as the abandoned listing path: [USDT0 on Arbitrum](https://usdt0.to/ecosystem/arbitrum), [USDT0 technical documentation](https://docs.usdt0.to/technical-documentation/developer/)
- [Zcash protocol specification](https://zips.z.cash/protocol/protocol.pdf)
- [Zcash transparent and shielded address documentation](https://zcash.readthedocs.io/en/latest/rtd_pages/addresses.html)
- [Zcashd deprecation and Zebra migration status](https://z.cash/support/zcashd-deprecation/)
- [Zcash NU6.3 status](https://z.cash/upgrade/nu6-3/)
- [Uniswap v2 pair reference](https://github.com/Uniswap/v2-core/blob/master/contracts/UniswapV2Pair.sol)
- [OpenZeppelin TimelockController documentation](https://docs.openzeppelin.com/contracts/5.x/api/governance)
- [OpenZeppelin security utilities](https://docs.openzeppelin.com/contracts/5.x/api/utils)
- [EIP-712 typed structured data hashing and signing](https://eips.ethereum.org/EIPS/eip-712)
- [ZIP 300 transparent P2SH atomic-swap protocol](https://zips.z.cash/zip-0300)
- [BIP 65 OP_CHECKLOCKTIMEVERIFY specification](https://github.com/bitcoin/bips/blob/master/bip-0065.mediawiki)

## 18. Exact-token EVM conditional lock

`contracts/src/swap/ConditionalLock.sol` is the EVM primitive for one native ZEC atomic-swap fill. One contract instance binds one swap identity, one full-terms commitment, one token, three fixed roles, one amount, one SHA-256 hashlock, and three ordered deadlines. [ADR 0003](adr/0003-evm-conditional-lock.md) defines the behavior.

### 18.1 Contract guarantees

The lock is non-upgradeable. It has no proxy, owner, governor, pauser, oracle, callback, native-value receiver, arbitrary call, arbitrary token, arbitrary recipient, fee, seizure, sweep, or rescue path.

Only the immutable funder can fund. Only the immutable claim recipient can claim. Only the funder can refund, and the refund recipient must equal that funder. Funding and claiming close at separate inclusive cutoffs. Refund starts at the later inclusive refund time. The gap between claim cutoff and refund time permits neither outcome.

OpenZeppelin `SafeERC20` handles standard, false-returning, and no-return ERC-20 behavior. Exact contract and recipient balance deltas reject no-op and fee-on-transfer behavior. `ReentrancyGuard` protects every state change. A failed token interaction rolls back the state transition.

### 18.2 Adversaries and controls

| Adversary or failure | Goal or effect | Control and residual risk |
| --- | --- | --- |
| Copied-preimage submitter | Front-run the rightful claimant | Only `claimRecipient` may call, and payout cannot be redirected |
| Malformed swap packet | Bind the wrong fill, asset, role, amount, hash, or time | Wallet and observer compare every immutable and `termsHash` before funding; the contract rejects zero or invalid constructor values |
| Late claimant | Claim after the EVM refund process should begin | `claim` closes at `claimCutoff`, strictly before `refundTime` |
| Refund redirector | Send the refund to another address | `refundRecipient == funder`, only `funder` may call, and the call accepts no recipient |
| Replay | Fund twice or reach both terminal states | State transitions permit one funding and one terminal outcome |
| Token anomaly | Deliver less than the exact amount or reenter | `SafeERC20`, exact balance deltas, and `nonReentrant`; issuer pause, upgrade, denylist, or freeze remains possible |
| Direct token donor | Block funding or influence payout | Funding checks the incoming delta, not a zero starting balance; surplus cannot be swept and remains unreachable |
| Duplicate deployer | Create another instance with the same `swapId` | No global registry exists; deterministic deployment records and observer indexes must reject duplicates |
| Chain reorganization | Reverse observed funding, claim, or refund | Confirmation policy and reorganization handling remain offchain stop conditions |

### 18.3 Invariants and stop conditions

The EVM leg must satisfy:

1. Every immutable term matches the wallet-approved fill.
2. `fundingCutoff < claimCutoff`, `claimCutoff + 1 < refundTime`, and funding starts with a future cutoff.
3. The lock moves only through `Unfunded -> Funded -> Claimed` or `Unfunded -> Funded -> Refunded`.
4. A successful incoming or outgoing transfer changes the relevant balances by exactly `amount`.
5. Claim and refund are terminal and mutually exclusive.
6. No event repeats the preimage.
7. The matcher, coordinator, observers, and hosted UI never hold a wallet key, sign, broadcast, or submit on a user's behalf.
8. The exact deployed bytecode, constructor packet, token identity, source commit, and manifest agree before any funding is enabled.

Stop the workflow if any immutable differs, any deadline order is unsafe, a duplicate `swapId` is observed, token behavior changes, issuer controls block a role or the lock, deployment evidence is absent or conflicting, or either chain reorganizes beyond the accepted observation state.

### 18.4 Test coverage

| Property | Test surface |
| --- | --- |
| Immutable terms, roles, happy paths, and replay | `contracts/test/ConditionalLock.t.sol` |
| Inclusive cutoffs and the safety gap | `contracts/test/ConditionalLockDeadline.t.sol` |
| False, absent, malformed, no-op, fee, revert, donation, and callback token behavior | `contracts/test/ConditionalLockMaliciousToken.t.sol` |
| Amount, preimage, and timeline input ranges | `contracts/test/ConditionalLockFuzz.t.sol` |
| Conservation, immutable terms, terminal exclusivity, and handler failures | `contracts/test/ConditionalLockInvariant.t.sol` |
| Deployment, fund, claim, and refund ceilings | `contracts/test/ConditionalLockGas.t.sol` |
| Selector, event, constructor, and calldata agreement | `src/lib/conditional-lock-abi.test.ts` |
| False deployment record and fail-closed manifest mutations | `scripts/validate-conditional-lock-manifest.test.mjs` |

### 18.5 Residual and out-of-scope risks

The contract cannot verify the native ZEC transaction, enforce the canonical offchain `termsHash` encoder, prevent a duplicate `swapId` across separate instances, reverse stablecoin issuer action, recover unsolicited tokens, or prove an offchain observer is current.

Transparent ZEC transaction construction, wallet integration, chain clients, live token selection, deployment, signatures, broadcast, shielded ZEC, generalized cross-chain messaging, and production legal or compliance controls remain outside this workstream.

## 19. ZEC half of the atomic swap (transparent P2SH)

The ZEC leg of the atomic swap uses a transparent P2SH output that holds
ZEC until either the buyer reveals the preimage on the Zcash claim
path or the seller refunds after the lock time. The design is fixed
in [ADR 0005](adr/0005-zcash-p2sh-atomic-swap.md).

### 19.1 Contract guarantees

The atomic-swap script encodes two terminal outcomes of one fill. The
claim branch reveals the preimage and signs with the buyer's key. The
refund branch waits for the lock time and signs with the seller's key.
The script is a single byte string that the matcher, the wallet
adapter, and the offchain observers all reconstruct from the same
fill terms; a divergence is a stop condition.

The transparent address encoder uses the published testnet and mainnet
version bytes. The Base58Check checksum fails closed on a wrong-network
or corrupt address. The compressed secp256k1 public key parser rejects
a wrong length, a wrong prefix, and a leading zero in the x coordinate.

The wallet adapter is a typed interface. It returns an unsigned
transaction and a transaction id. The signing surface is an injected
callback. The interface never reads a key from disk and never holds a
key in memory. The hash function used by the address encoder is the
Node-native `ripemd160`; the browser path is a follow-up because Web
Crypto does not expose `ripemd160`.

### 19.2 Adversaries and required controls

| Adversary | Goal | Required control |
| --- | --- | --- |
| Counterparty | Take the ZEC and skip the preimage reveal | The claim branch requires the preimage; the refund branch requires the lock time |
| Frontend attacker | Trick the funder into sending ZEC to an attacker-controlled P2SH | The script hash and the address must match between the matcher, the wallet adapter, and the wallet display |
| Pauser / governor | Pause and trap user funds | There is no admin role on the ZEC side. The ZEC lock surface has no admin transfer path. |
| Reorg or chain split | Reverse a claim or refund | The offchain coordinator and the watchtower surface reorg events and freeze the swap |
| Wrong script bytes | Lure the funder into a non-atomic P2SH | The script builder is deterministic and the script hash is replayed in the coordinator |
| Wrong pubkey | Lure the buyer into signing the seller's P2PKH | The buyer pubkey and the seller pubkey must differ; the builder rejects equal pubkeys |

### 19.3 Invariants and stop conditions

The ZEC leg of every fill must satisfy the following invariants. A
violation moves the fill to a disputed state and triggers a watcher
alert.

1. The script is a single byte string that round-trips through the
   parser.
2. The script hash is the same on the matcher, the wallet adapter,
   and the offchain coordinator.
3. The lock time is strictly later than the EVM refund deadline.
4. The buyer pubkey and the seller pubkey are different.
5. The 20-byte hash in the claim branch matches `RIPEMD160(SHA256(preimage))`.
6. The hash function is `OP_HASH160` (which is
   `RIPEMD160(SHA256(x))`). No other hash function is used.
7. The signing surface is not active in this PR. The signing flag
   stays off.

Stop conditions that must halt the leg and surface to the user:

* the script and the address diverge between the matcher and the wallet
  adapter;
* the lock time is not strictly later than the EVM refund deadline;
* the buyer and seller pubkeys are equal;
* the preimage revealed on the ZEC chain does not match the EVM hash;
* the ZEC chain reorganizes above the configured confirmation depth
  after a claim or refund;
* the underlying Zcash node returns a wrong script, a wrong address,
  or a wrong transaction;
* a wallet is asked to sign a transaction whose outputs do not match
  the agreed terms.

### 19.4 Test coverage

| Invariant | Test |
| --- | --- |
| 1 | `zcash-atomic-swap.test.ts::buildAtomicSwapScript produces a script that round-trips through parseAtomicSwapScript` |
| 2 | `zcash-wallet-adapter.test.ts::hashAtomicSwapParams returns a deterministic hex string` |
| 3 | `zcash-atomic-swap.test.ts::buildRefundBranch rejects a lock time out of uint32 range` |
| 4 | `zcash-atomic-swap.test.ts::buildAtomicSwapScript rejects identical buyer and seller pubkeys` |
| 5 | `preimage.test.ts::hashPreimage matches the pinned vector` |
| 6 | `zcash-script.test.ts::OP table exports the canonical Bitcoin/Zcash opcodes` |
| 7 | `docs/adr/0005-zcash-p2sh-atomic-swap.md` and the test-only signing-surface absence check |

### 19.5 Out of scope for the ZEC leg

* Shielded ZEC. The current lock surface uses the transparent pool.
* Custodial or wrapped representations of ZEC. ADR 0001 is superseded.
* Cross-chain generalized message passing. The swap is a strict
  hash-and-deadline protocol.
* A live wallet integration. The signing surface ships only with the
  wallet adapter in a later PR.


## 20. Atomic-swap observer and watchtower surface

The observer service watches the ConditionalLock contract and a set
of P2SH lock addresses, reduces the events to coordinator
transitions, persists the snapshot to disk, and surfaces the
watchtower's alerts over HTTP. The service is the second half of
the read-only surface that PR 1 (EVM lock) and PR 3 (ZEC leg) leave
open. The signing surface lives in the wallet adapter; the
observer never holds a key and never signs a transaction.

### 20.1 Trust boundary

The observer trusts the underlying chain clients (Arbitrum RPC and
Zebrad / Zcashd) to deliver the correct logs and outpoints. The
observer does not trust the on-disk snapshot: the bootstrap path
detects a missing-snapshot-after-init incident and refuses to start
fresh. The watchtower does not trust the matcher; it derives every
alert from the coordinator's persisted state and a clock input.

### 20.2 Threat matrix

| Adversary | Goal | Required control |
| --- | --- | --- |
| EVM RPC operator | Drop a Deposited event to keep the buyer locked | The poller resyncs from the configured fromBlock; the watchtower surfaces a missing-terminal-event after the deadline |
| ZEC chain operator | Drop a funded outpoint to keep the seller locked | The poller polls every address; the watchtower surfaces a missing-terminal-event |
| Snapshot attacker | Replace the on-disk snapshot to revert the coordinator | The bootstrap writes a marker file on first success and refuses to start fresh if the snapshot is missing; the marker is best-effort and the operator is the last line of defense |
| Reorg adversary | Reverse a claim or refund after the deadline | The watchtower surfaces a reorg-depth-exceeded alert and freezes the fill until confirmation depth clears |
| Clock skew | Apply a transition with a wrong timestamp | The poller takes the timestamp from the event record and the snapshot stores it; the watchtower's deadline-breach alert triggers if a leg is still funded past the deadline |
| Untrusted input | Pass a malformed log or outpoint | The reducers reject non-hex32 fill ids; the persistence layer rejects unparseable snapshots; the bootstrap surfaces parse errors as the error state |

### 20.3 Invariants and stop conditions

The observer surface must satisfy the following invariants. A
violation moves the fill to a disputed state and triggers a watcher
alert.

1. The coordinator state round-trips through the JSON snapshot
   without loss: every fill's leg state, deadlines, and disputed
   flag survive a write/read cycle.
2. The cursor monotonically advances on every successful transition
   and stays still on every rejected transition.
3. The watchtower's deadline-breach alert never fires for a fill
   that is already settled.
4. The bootstrap distinguishes a fresh start (no marker, no
   snapshot) from a missing-after-init (marker present, snapshot
   absent) and refuses to start fresh in the second case.
5. The poller applies EVM and ZEC transitions in non-decreasing
   observed-at order.
6. The poller never holds a key, never signs a transaction, and
   never mutates chain state.

Stop conditions that must halt the leg and surface to the operator:

* the snapshot file is missing after the initialization marker is
  present;
* the snapshot file does not parse;
* the cursor regresses between two consecutive polls;
* the watchtower emits a missing-terminal-event;
* the watchtower emits a reorg-depth-exceeded alert;
* the watchtower emits a deadline-breach alert past the configured
  buffer.

### 20.4 Test coverage

| Invariant | Test |
| --- | --- |
| 1 | coordinator-snapshot.test.ts::snapshotFromJSON round-trips a multi-fill coordinator |
| 2 | `atomic-coordinator.test.ts::applyTransition` increments the cursor on each transition |
| 3 | watchtower.test.ts::detectAlerts does not flag a fill that is already settled |
| 4 | server.test.ts::bootstrapService returns missing when the marker is set but the snapshot is gone |
| 5 | evm-event-reducer.test.ts::reduceEVMEvents sorts by observed timestamp then fill id |
| 6 | poller.test.ts::pollOnceInto applies EVM transitions and persists the snapshot (no key surface) |

### 20.5 Out of scope for the observer

* Live wallet signing. The signing surface ships only with the
  wallet adapter in a later PR.
* Transaction submission. The poller never submits an EVM or ZEC
  transaction.
* Shielded ZEC. The observer only watches transparent P2SH
  addresses.
* Custodial or wrapped representations of ZEC. The observer is
  read-only on the chains.

## 21. Public market data surface

The public market data surface is four read-only HTTP endpoints
on the matcher service: /ticker, /trades, /depth, and
/markets. The surface is the public read-only view of the
matcher operator's in-memory state.

### 21.1 Trust boundary

The public surface trusts the matcher operator's in-memory state
to be the canonical order book and receipt history. The public
surface does not trust the network: every endpoint validates its
input and bounds its response size. The public surface does not
trust the requester: the endpoints do not authenticate the
caller; the public surface is by design unauthenticated.

### 21.2 Threat matrix

| Adversary | Goal | Required control |
| --- | --- | --- |
| Public reader | Probe the order book to front-run the next fill | The depth endpoint aggregates by price level and does not expose the maker identifier; the trades endpoint exposes the receipt sequence and the maker id but not the underlying order detail |
| Rate-limit attacker | Saturate the operator with public read traffic | The HTTP layer applies a per-IP rate limit; the public surface is the only consumer of the per-request `nowSeconds` clock |
| Reflected XSS | Inject a script into the JSON response | The endpoints return `application/json`; the response is not embedded in HTML; the frontend treats the response as data, not as HTML |
| Parameter abuse | Send a limit of 2^31 to exhaust memory | The endpoints cap limit at 1000 and levels at 200; values outside the bound return 400 |
| Order-book replay | Reconstruct the maker's resting order from the public depth | The depth endpoint aggregates size per price level only; the maker's order id and the receipt's order digest are not exposed |

### 21.3 Invariants and stop conditions

The public market data surface must satisfy the following
invariants. A violation halts the surface and surfaces an
operator alert.

1. The ticker is derived from the operator's `book` and
   `receipts`; the function is pure and never mutates the
   operator.
2. The trades feed walks receipts in reverse and stops at the
   requested limit; the function never returns more than
   limit trades.
3. The depth endpoint aggregates size by price level; the
   aggregation is deterministic for a fixed book.
4. The markets endpoint reflects the operator's `baseAsset` and
   quoteAssets; a misconfiguration in the operator is
   surfaced as a 503 on the matcher service's /orders
   endpoint, not on the public surface.
5. The endpoints never reach out to the network; the latency is
   bounded by the operator's in-memory state size.

Stop conditions that must halt the surface and surface to the
operator:

* the operator's `book` and `receipts` are out of sync (the
  watchtower surfaces the desync as a coordinator alert);
* the matcher service's /health returns 503 (the public
  surface inherits the 503);
* the rate limiter reports a sustained attack on a single IP
  (the operator pages the on-call).

### 21.4 Test coverage

| Invariant | Test |
| --- | --- |
| 1 | market-data.test.ts::tickerFromOperator reports bid, ask, mid, spread, last, and 24h volume |
| 2 | market-data.test.ts::tradesFromReceipts respects the limit |
| 3 | market-data.test.ts::depthFromBook aggregates same-price orders and limits levels |
| 4 | market-data.test.ts::marketsFromOperator reads the base and quote assets from the operator |
| 5 | market-data.test.ts::tickerFromOperator rejects a negative now (the function is pure) |

### 21.5 Out of scope

* WebSocket and SSE for live updates. The surface exposes
  snapshots only; live streaming is a follow-up PR.
* Per-user order book subscriptions. The surface is public; a
  per-user feed is the responsibility of the auth surface.
* Aggregated candles (1m, 5m, 1h). The chart surface is a
  separate concern.

## 22. Operations hardening surface

The operations hardening surface is a set of pure-function
libraries that the services consume and an HTTP layer that the
operator calls. The surface is the single source of truth for
the operator's on-call rotation.

### 22.1 Trust boundary

The operations surface trusts the services to report their
health, their SLO samples, and their alert records honestly.
The operations surface does not trust the network: every
endpoint validates its input and bounds its response size.

### 22.2 Threat matrix

| Adversary | Goal | Required control |
| --- | --- | --- |
| Operator | Mis-route a critical alert to the wrong channel | The alert router is deterministic; the routing table is in code review |
| Attacker | Inject a malformed metric label | The metrics counter rejects empty label keys; the Prometheus renderer escapes label values |
| Replay attacker | Replay a SLO sample from a previous window | The SLO tracker caps the per-key buffer and drops old samples |
| Pager | Page the on-call without a real incident | The alert router maps critical to pagerduty and warning to slack; the operator's runbook requires a SLO verdict before paging |

### 22.3 Invariants and stop conditions

1. The metrics counter is a pure function over a state record;
   the same sequence of operations always produces the same
   state.
2. The SLO tracker caps the per-key buffer at maxSamples and
   drops the oldest samples when the cap is hit.
3. The health aggregator reports ok: false when any service is
   unhealthy; the aggregator never silently drops a failing
   service.
4. The alert router returns `null` for an unknown service or
   severity; the operator is responsible for the default
   routing.
5. The operations surface never reaches out to the chain clients
   and never signs a transaction.

### 22.4 Test coverage

| Invariant | Test |
| --- | --- |
| 1 | metrics.test.ts::incCounter increments the named counter with no labels |
| 2 | slo-tracker.test.ts::recordSample caps the per-key buffer at maxSamples |
| 3 | health-aggregator.test.ts::aggregateHealth reports not-ok when any service is unhealthy |
| 4 | `alert-router.test.ts::routeAlert` returns null when no route is registered |
| 5 | metrics.test.ts::renderPrometheusText emits HELP, TYPE, and the value lines (the function is pure) |

### 22.5 Out of scope

* A Prometheus remote-write adapter.
* A SLO sample persistence layer.
* A cross-service tracing layer.
* A PagerDuty / Slack adapter. The alert router returns the
  routing decision; the operator is responsible for the actual
  delivery.

## 23. Final integration and audit prep surface

The final integration surface is the set of pure-function
libraries and documents that gate the project's readiness for
the production deployment. The surface is the single source of
truth for the release verdict.

### 23.1 Trust boundary

The final integration surface trusts the project's automated
gates (lint, typecheck, tests, secret-scan, build) and the
audit checklist. The surface does not trust the network: every
gate is reproducible from the project root.

### 23.2 Threat matrix

| Adversary | Goal | Required control |
| --- | --- | --- |
| Operator | Ship a release that fails the gates | The release verdict is the only gate; the on-call engineer must read the verdict before signing off |
| Attacker | Inject a malicious commit that bypasses the gates | The gates run on every PR; the audit checklist is reviewed by the security team |
| Auditor | Misread the audit checklist | The checklist is the single source of truth; the release verdict references the checklist |

### 23.3 Invariants and stop conditions

1. The release verdict is reproducible from the project root.
2. The audit checklist is the canonical record of the audit
   surface.
3. The release verdict is `ready` only when all required gates
   pass.
4. The on-call engineer's sign-off is the only manual gate.
5. The release verdict is regenerated on every release.

### 23.4 Test coverage

| Invariant | Test |
| --- | --- |
| 1 | `release-readiness.test.ts::evaluateReadiness` returns ready when all required gates pass |
| 2 | `audit-checklist.test.ts::incompleteRequiredItems` returns required items that are not done |
| 3 | `release-readiness.test.ts::evaluateReadiness` returns not-ready when any gate fails or skips |
| 4 | `release-readiness-evidence.md` documents the sign-off requirement |
| 5 | scripts/release-readiness.mjs regenerates the verdict on every run |

### 23.5 Out of scope

* The production deployment.
* The audit team's review.
* The release notes for the production deploy.
