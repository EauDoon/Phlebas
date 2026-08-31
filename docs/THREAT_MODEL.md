# Phlebas Threat Model

> Status as of 31-08-2026: design document. The public app is a no-value simulation. Local loopback stubs exist for a textest gateway, matcher, and observer. None of the proposed production bridge, custody, matching, settlement, routing, automated market maker, administration, monitoring, or incident controls are deployed or audited.

## 1. Purpose and decision

Phlebas is intended to become a hybrid exchange for two markets:

- `ZEC-USDC`
- `ZEC-USDT`

The design combines an offchain central limit order book, onchain atomic settlement, and two constrained Uniswap v2-style liquidity pools. Transparent ZEC enters through a federated gateway and is represented on Arbitrum One as pZEC.

The design is acceptable only for simulation, testnet, and a later strictly capped beta. The pZEC gateway is the dominant risk. Phlebas must not be described as fully decentralized, trustless, shielded, private, or live native-ZEC execution. Product labels may say native ZEC against native USDC and native USDT. USDT0 is abandoned.

## 2. Current repository reality

The public Vercel app is a no-value simulation. Local optional stubs exist and are not production:

- In-browser session matcher, plus a loopback matcher operator that is never hosted on Vercel.
- Undeployed Arbitrum Sepolia contract sources. The manifest stays `deployed: false` until a real Sepolia transaction is recorded.
- Optional EIP-1193 wallet connection on Arbitrum Sepolia only. Default is sign-only.
- Local `textest` gateway and observer stubs on `127.0.0.1`. No Zebra RPC, no mainnet TEX.

Values shown for prices, depth, volume, total value locked, pool reserves, fees, and trades are simulation data. They are not evidence of a live market or asset backing. Do not set `PHLEBAS_GATEWAY_URL` or `PHLEBAS_MATCHER_URL` on Vercel.

## 3. Proposed architecture

```text
Transparent ZEC deposit
  -> independent Zebra node quorum
  -> threshold deposit attestation
  -> pZEC mint on Arbitrum One
  -> user wallet
       -> signed order -> offchain CLOB -> onchain settlement
       -> ZEC/USDC pool
       -> ZEC/USDT pool
       -> atomic route across CLOB and AMM

pZEC redemption request
  -> destination and amount validation
  -> finalized pZEC burn
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
| pZEC token | Represents a claim on transparent ZEC | Gateway solvency, mint authority, and redemption availability |
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
| pZEC | New Phlebas contract, address not assigned | 8 |
| Native USDC on Arbitrum | `0xaf88d065e77c8cC2239327C5EDb3A432268e5831` | 6 |
| Native USDT on Arbitrum | Address not assigned. USDT0 is abandoned. Reverify issuer-native USDT at the mainnet gate. | 6 |
| LP tokens | One token per constrained pair | 18 |

Reject bridged USDC variants, lookalike tokens, arbitrary pairs, rebasing tokens, and fee-on-transfer tokens. Token address, code hash, decimals, symbol, issuer documentation, and runtime behavior must be checked again at the release gate.

The canonical API and contract market names are `ZEC-USDC` and `ZEC-USDT`. Those pairs are native ZEC against native USDC or native USDT. USDT0 is abandoned. The interface remains a no-value simulation and must not claim live funds.

## 5. Assets and security objectives

### 5.1 Assets to protect

- Transparent ZEC reserve UTXOs.
- pZEC mint and burn authority.
- User ZEC, USDC, USDT, and LP positions. The candidate ERC-20 form remains pZEC.
- Signed orders, nonces, allowances, limits, and cancellation state.
- Matcher sequence records and fill submissions.
- Attester, custody, guardian, governance, deployer, and treasury keys.
- Reserve and liability records.
- Contract source, reviewed commit, deployment inputs, and bytecode identity.
- Release pipeline, domain, frontend, RPC endpoints, and dependency integrity.

### 5.2 Security objectives

1. No pZEC is minted without one mature, unique, controlled transparent ZEC deposit.
2. Confirmed controlled reserve plus separately reported, exact claim-matched in-transit principal cover all gateway liabilities plus the required buffer. In-transit principal is not reusable reserve, and unconfirmed change never counts toward coverage.
3. No order settles above a buyer's limit or below a seller's limit.
4. No order is replayed, overfilled, double-filled, or charged above its signed fee cap.
5. No route spends more than `maxIn`, returns less than `minOut`, executes after its deadline, or changes its signed recipient or venues.
6. No AMM swap violates its fee-adjusted constant-product invariant.
7. No administrator can seize user assets, arbitrarily mint pZEC, bypass a timelock, or replace contract logic in place.
8. Emergency action stops new risk while preserving cancellation, allowance revocation, and LP removal where the underlying token permits them.
9. Soft L2 confirmation is never represented as Ethereum posting or rollup finality.
10. The interface cannot make simulated values appear to be live or backed.

## 6. Trust assumptions and decentralization limits

Phlebas depends on the following trusted or governed parties:

- The transparent ZEC custody quorum can move reserve assets and censor redemptions.
- The attester quorum can approve deposits and payout observations. A colluding quorum can create unbacked pZEC or falsely finalize a payout unless additional proof systems are implemented.
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

## 7. pZEC gateway

### 7.1 Transparent-only boundary

The gateway accepts assigned Zcash transparent addresses. Transparent addresses and amounts are public. Phlebas does not preserve Zcash shielded privacy after gateway entry, and all Arbitrum activity is public.

As of 30-08-2026, `zcashd` is end-of-life and does not support NU6.3. A future gateway must use currently supported Zebra releases and a separately secured transaction construction and signing service. Run at least three geographically and provider-independent Zebra nodes. Require agreement on network, settled upgrade, tip hash, chainwork, transaction, output, and maturity.

### 7.2 Deposit state machine

1. The gateway reserves an assigned transparent address and binds it to an EVM destination.
2. Independent Zebra observers identify the exact `txid`, output index, address, and zatoshi amount.
3. The deposit waits for the active confirmation rule.
4. A threshold attestation binds the deposit outpoint, amount, destination, Zcash height, tip hash, and chainwork.
5. The gateway consumes the deposit ID once and mints the exact pZEC amount.
6. Any disagreement, stale node, reorganization, duplicate outpoint, or amount mismatch stops minting.

The initial security policy should require 100 confirmations and at least two hours, whichever is later. This is a design recommendation, not a claim of assured finality. The policy must account for cumulative work and wall-clock time because Zcash block spacing may change.

### 7.3 Redemption state machine

1. The user requests a transparent ZEC payout and sees the exact destination, gross amount, fees, and minimum native output.
2. The destination, amount, limits, and policy result are validated before any irreversible action.
3. The user burns pZEC. The first implementation does not create a payout liability from escrowed tokens.
4. The gateway waits for the applicable Arbitrum finality tier, consumes the burn event once, and records an equal pending native payout liability.
5. Only then may the custody quorum commit, sign, and broadcast the exact ZEC transaction.
6. Independent observers confirm the native payout, then the gateway clears the matching payout liability. If the payout is reorganized or fails after broadcast, the liability remains open. The coordinator may rebroadcast only the exact committed bytes. It may create a replacement only after independent proof that the original cannot confirm and its selected inputs are spendable and re-reserved under a new unique transaction record.
7. An unrecoverable pre-signature failure may restore pZEC only through a single-use refund authorization that permanently cancels the payout claim. Once signed, the claim remains payable. A claim can never be both refunded and paid.

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

All accounting uses integer zatoshis. `1 ZEC = 100,000,000 zatoshis`, so pZEC uses 8 decimals.

Define:

```text
A = confirmed transparent ZEC in controlled, spendable, and uncommitted UTXOs

L = pZEC totalSupply
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

- Before a finalized burn, a reversible redemption request leaves pZEC user-controlled and in `pZEC totalSupply`; it creates no pending payout liability.
- A finalized burn reduces `pZEC totalSupply` and creates an exactly equal pending payout liability.
- At transaction commitment, the full selected input `I` leaves `A`, exact principal `P` enters only its matching `T`, change enters `C` with a 100 percent coverage haircut, and `N` is recognized under the approved fee policy.
- `T` cannot cover token supply, refundable deposits, the buffer, another payout, fees, or any unmatched obligation.
- `C` is tracked for attribution but cannot satisfy either coverage inequality before it is confirmed and spendable.
- After confirmed native payment, confirmed change moves from `C` to `A`, and both `T` and the matching payout liability decrease by exact principal `P`.
- An unminted controlled deposit remains a refundable liability until minted or refunded.
- Operator fees and user liabilities are recorded separately.
- Before signing a native payout, the gateway removes full `I` from simulated `A` and refuses to sign unless `I = P + C + N`, `0 <= T <= W`, `A >= (L - T) + B`, and `A + T >= L + B` all remain true. Eventual change cannot rescue the pre-sign check.
- An invalid, stale, conflicted, reorganized, or unmatched transaction moves its principal from `T` to excluded `U` immediately. Full `I` returns to `A`, and its `P`, `C`, and `N` entries reverse, only after independent observers prove the custody inputs are spendable again and the transaction cannot confirm. Otherwise the bridge remains in incident halt.

Publish a reproducible reserve snapshot at least every 10 minutes and after every reserve movement. It should include the Zcash tip, UTXO root, `A`, `T`, excluded `U`, excluded `C`, each liability class, pZEC supply, and buffer. Publish both controlled coverage `A / (L - T + B)` and total matched coverage `(A + T) / (L + B)`, including each numerator and denominator. Label `T` as non-reusable settlement in transit and never present `A / L` as the governing solvency ratio. Independent watchers must be able to rebuild the result from Zebra and Arbitrum.

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

Use integer arithmetic and full-width multiplication and division. The contract must apply side-aware rounding that never worsens a signed limit. Canonical price units are quote micro-units per `100,000,000` pZEC atoms.

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

LPs face impermanent loss, thin-liquidity manipulation, adverse selection, pZEC depeg and custody risk, stablecoin depeg and issuer-control risk, smart-contract risk, and the possibility that a stablecoin issuer freezes the pool address.

## 11. Routing and oracle policy

A stateless route executor may combine signed CLOB fills and one constrained AMM swap in one Arbitrum transaction. The user signs:

- Input token and maximum input.
- Output token and minimum output.
- Allowed venues and pair.
- Deadline.
- Final recipient.
- Any permitted partial-fill rule.

The transaction reverts if any order becomes invalid or the aggregate protection fails. The executor must return all residual assets to the signed recipient and must not retain balances between routes.

No oracle controls matching, settlement, AMM execution, pZEC minting, or redemption. Signed limits, `maxIn`, `minOut`, exact pair addresses, and deadlines are authoritative.

AMM cumulative prices and independent multi-venue observations may support monitoring or interface warnings. They must not create an onchain liquidation, solvency, or settlement dependency. An AMM spot price is never a trusted oracle.

## 12. Administration and upgrade model

### 12.1 Roles

| Role | Proposed threshold | May do | Must not do |
| --- | --- | --- | --- |
| Emergency guardian | 2-of-3 | Pause new pZEC mints, CLOB fills, and route execution | Unpause, seize, mint, spend reserves, change fees, rotate signers, or upgrade |
| Governance | 4-of-7 behind 7-day timelock | Rotate signer sets, change narrow parameters inside immutable caps, and unpause after remediation | Bypass delay, seize assets, or replace logic in place |
| Custody quorum | 5-of-7 | Spend exact reserve transactions under policy | Mint pZEC or change protocol parameters |
| Attester quorum | 4-of-7 | Attest mature deposits and confirmed payouts | Spend reserves, change caps, or upgrade |
| Treasury | Separate receiver | Receive disclosed protocol fees | Pull user funds or reserve backing |

The deployer relinquishes privileged access after roles and delays are verified.

### 12.2 Versioning

pZEC logic, settlement, route execution, AMM factory, and AMM pairs should be non-upgradeable. A material logic change deploys a new version with a new EIP-712 domain and explicit user migration. Existing signed orders cannot replay into a new settlement version.

The gateway may change signer membership and bounded risk parameters through the timelock, but not replace its logic through a proxy. A gateway logic defect requires mint pause, a new token or controller design, independent review, and explicit migration.

Stablecoin contracts remain outside Phlebas control. Circle documents pause, blacklist, mint, and upgrade roles for USDC. Native USDT remains subject to Tether issuer and contract controls. Phlebas must isolate an affected market and disclose the dependency rather than claiming immutable stablecoin settlement. USDT0 is abandoned.

## 13. Threats and required controls

| Threat | Impact | Required control |
| --- | --- | --- |
| Custody quorum compromise | Reserve theft and pZEC insolvency | Independent hardware-held keys, 5-of-7 threshold, exact transaction review, limits, movement alerts, and recovery drills |
| Attester quorum compromise | Fake mint or false payout finalization | Independent 4-of-7 quorum, unique outpoint registry, mint caps, public attestations, reserve watchers, and immediate mint pause |
| Zcash reorganization | Minted pZEC loses native backing | Conservative maturity, chainwork and wall-clock policy, independent Zebra agreement, reorg monitor, buffer, and mint stop |
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

Pause new pZEC minting when any condition occurs:

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
- Exact zatoshi-to-pZEC conversion.
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
