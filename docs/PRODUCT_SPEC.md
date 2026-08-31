# Phlebas product specification

Status: design and no-value simulation, dated 30-08-2026.

## 1. Product statement

Phlebas is a hybrid spot DEX design for two market labels:

- `ZEC/USDC`, settled as `pZEC-USDC`
- `ZEC/USDT`, settled as `pZEC-USDT0`

It combines signed order intents and atomic onchain settlement with small-scope constant product liquidity pools. A separate transparent-Zcash gateway would hold native ZEC and issue pZEC.

## 2. Goals

1. Give ZEC holders a compact, professional spot-trading experience.
2. Let users keep quote assets and pZEC in their wallets until settlement.
3. Add simple LP positions without farms, leverage, or exotic hooks. Mainnet contract-access policy remains unresolved.
4. Make the ZEC custody and privacy boundary visible at every relevant decision.
5. Make reserves, liabilities, sequencing, governance changes, and incidents independently observable.

## 3. Non-goals for version 1

- Shielded ZEC deposits or withdrawals
- Perpetuals, margin, borrowing, lending, or liquidation
- Cross-margin or omnibus exchange balances
- Token incentives, points, rebates, farms, or gauges
- Arbitrary pair creation
- Smart order types beyond limit, market, GTC, IOC, and FOK
- Mobile-native applications
- Claims of trustless, private, decentralized custody, or censorship-free operation

## 4. Users and permissions

| Role | Intended action | Authority boundary |
| --- | --- | --- |
| Trader | Sign, cancel, and settle spot orders | Controls only their wallet assets and order intents |
| LP | Add or remove pool liquidity | Controls only their LP position |
| Matcher | Accept, sequence, and propose compatible orders | Cannot move funds without valid signatures and contract checks |
| Router | Atomically select or split CLOB and AMM execution | Stateless, bounded by signed venue and price constraints |
| Gateway attester | Confirm an eligible native ZEC deposit | Cannot spend custody reserves |
| Custody signer | Authorize native ZEC withdrawal transactions | Cannot mint pZEC without a valid deposit attestation |
| Emergency council | Pause mints, fills, or routing | Cannot seize assets, unpause, upgrade, or change economics |
| Governance | Apply delayed parameter changes | Bound by timelock, caps, and immutable contract limits |

## 5. Market presentation

The UI may show familiar market labels, but every order ticket, confirmation, fill, and history record must also name the settlement pair. `ZEC/USDT` must disclose that the proposed Arbitrum quote asset is USDT0.

Market data states are explicit:

- `Illustrative` for repository fixtures
- `Delayed` with the as-of time when the feed is stale
- `Live` only when connected to a monitored production source
- `Unavailable` when freshness or integrity checks fail

The interface never fabricates a balance, wallet state, deposit address, price, order, fill, or yield.

## 6. Order book

### 6.1 Signed order

The proposed EIP-712 order binds at least:

```text
maker
side
base asset
quote asset
base amount
limit price
time in force
nonce
account epoch
expiry
salt
recipient
maximum fee
allowed venues
chain ID
verifying contract
```

Contract wallets use ERC-1271 signature validation. A market order is represented as IOC with a user-signed worst acceptable price. There is no unbounded market-order instruction.

The reference ticket uses a `0.01` quote-price tick, one pZEC atom (`0.00000001 pZEC`) as the base-size step, and one quote-token atom (`0.000001 USDC` or `USDT0`) as the minimum displayed notional. It rejects extra precision, underflow, and values outside the exact preview range. A market worst price rounds outward to the next tick, up for buys and down for sells. Production parameters must be versioned and enforced identically in the matcher and settlement contract.

### 6.2 Matching

The matcher follows deterministic price-time priority. It assigns a monotonic sequence number and produces signed intake receipts. Periodic sequence roots and an append-only event feed allow third parties to detect omission, reordering, or unexplained downtime.

The matcher may be fair and auditable, but it is not trustless. The UI must say that clearly.

### 6.3 Settlement

Compatible signed orders settle atomically from wallet to wallet. Settlement validates:

- Chain and verifying-contract domain
- Pair allowlist and exact token addresses
- Signature or ERC-1271 approval
- Remaining amount, nonce, account epoch, and expiry
- Side-aware integer price rounding
- Maximum maker and taker fee
- User-signed worst price and recipient
- Replay protection and fill accounting

No settlement call may depend on an oracle. External prices and TWAPs are monitoring signals only.

### 6.4 Cancellation

Users have two onchain escape hatches:

1. Mark individual nonces as canceled in a bitmap.
2. Increment the account epoch to invalidate every older order.

Allowance revocation remains a final wallet-level control.

### 6.5 Initial fee envelope

| Action | Proposed fee | Immutable or delayed limit |
| --- | --- | --- |
| Maker fill | 5 bps | Maximum 30 bps |
| Taker fill | 15 bps | Maximum 30 bps |
| AMM swap | 30 bps | Fixed in version 1 |
| LP protocol fee | Off | Cannot be activated in version 1 |

Any allowed fee change requires a seven-day timelock. Version 1 has no rebates because negative fees complicate solvency and manipulation controls.

## 7. Liquidity pools

Phlebas specifies only two constant product pools:

- `pZEC/USDC`
- `pZEC/USDT0`

Each swap enforces the fee-adjusted constant-product inequality, and the fixed 30 basis point input fee remains in the pool for LPs. Consequently, the reserve product after a valid swap is at least the reserve product before it, subject to exact integer-rounding rules. The version 1 pair and router surface is limited to add liquidity, remove liquidity, swap, permit, and reserve queries.

Excluded features include callbacks, flash swaps, dynamic fees, farms, gauges, leverage, arbitrary token listings, and governance-controlled pool assets.

LP warnings must cover pZEC redemption and reserve risk, stablecoin risk, smart-contract risk, impermanent loss, toxic flow from the order book, and emergency operating restrictions. Removing liquidity remains available during a trading pause unless the specific pool itself is compromised.

## 8. Best execution router

A stateless router may compare the signed order-book path with the AMM path and atomically split a trade. The user signs:

- Maximum input or minimum output
- Deadline
- Allowed venues
- Recipient
- Maximum aggregate fee

The router must revert the whole transaction when any bound fails. It cannot retain user balances.

## 9. Transparent ZEC gateway

### 9.1 Deposit intent

A production gateway would issue one fresh, single-use [ZIP 320 TEX address](https://zips.z.cash/zip-0320) for every deposit intent and would never reassign it. TEX is a wallet-level mechanism that helps prevent direct shielded transfers to a transparent receiver. It is not a consensus restriction and does not prove the lifetime provenance of an input.

### 9.2 Observation and mint

Independent Zebra observers identify the exact transaction output and bind:

```text
transaction ID
output index
amount in zatoshis
deposit address
Arbitrum destination
block height
tip hash and chain-work evidence
attestation epoch
```

The mint authorization is single-use. Native amounts remain integer zatoshis from observation through reconciliation. pZEC has 8 decimals, so no decimal conversion is required.

The [Zcash confirmation guidance in ZIP 315](https://zips.z.cash/zip-0315) provides a network baseline, but Phlebas mainnet policy is separately risk-tiered. A restricted canary would start with a substantially more conservative threshold, elapsed-time floor, and per-deposit cap. No zero-confirmation mint is allowed.

### 9.3 Withdrawal

A user completes one finalized pZEC burn to create a native-ZEC payout claim. The first implementation does not create a payout liability from escrowed tokens. The withdrawal state machine is:

```text
requested -> screened -> burn submitted -> burn finalized -> payable
requested | screened -> rejected before burn with review reason
burn submitted -> expired or reorganized evidence -> closed without finalized burn
burn finalized | payable -> pZEC restored only on unrecoverable pre-signature failure
payable -> transaction_prepared -> signed -> broadcast -> mined -> confirmed
signed | broadcast | mined -> unresolved
unresolved -> exact committed transaction observed -> broadcast | mined
unresolved -> verified input restoration -> payable
```

Every finalized burn produces exactly one payout or pZEC-restoration outcome. A single-use refund authorization must permanently cancel the unpaid claim before restoring pZEC. Once a native transaction is signed, the claim cannot be refunded and remains payable. The signed bytes, their canonical transaction ID, and selected-input reservation must survive a coordinator restart, and only those exact bytes may be rebroadcast. An unresolved claim may return to broadcast or mined only through independent observation of that exact transaction ID. Native network fees, service fees, destination, and minimum output must be disclosed before the burn.

The first implementation permits exactly one payout claim per native Zcash transaction. Inputs, change, fee, and signed bytes therefore belong to one claim. Canonical transaction IDs enter an append-only commitment history at signing and cannot be reused after confirmation or proof-gated restoration. Multi-claim payout batching remains unsupported until a transaction-level ledger can bind shared inputs and fees to multiple principals without double counting.

## 10. Required UI states

Every state must have visible loading, empty, stale, unavailable, rejected, and retry-safe behavior.

High-risk confirmations repeat:

- The asset that will leave the wallet
- The asset and network that will arrive
- The worst acceptable price
- All fees
- The pZEC custody and redemption dependency
- The transparent and publicly linkable Zcash boundary

## 11. Accessibility and responsive behavior

- Full keyboard access and visible focus states
- Semantic tables or grids with text equivalents for color-coded sides
- At least 320-pixel viewport support
- Reduced-motion support
- Buy and sell never distinguished by color alone in actionable controls
- Critical notices remain visible without hover

## 12. Acceptance criteria by surface

### Trading

- Deterministic order encoding matches contract test vectors.
- Partial fills, cancellations, expiries, and epoch invalidation reconcile exactly.
- A simulated market order cannot execute beyond its signed worst price.
- Stale data disables preview-to-sign transitions.

### LP

- Quote tests cover rounding, minimum output, reserve boundaries, and fee accounting.
- Only the two approved pair addresses are constructible.
- LP withdrawal works when fills, mints, and the router are paused.

### Gateway

- One native outpoint can authorize at most one mint.
- One pZEC burn can produce at most one native payout.
- Reserve and liability watchers reproduce the operator's result from public inputs.
- Reorg, observer disagreement, stale proofs, or reconciliation mismatch fail closed.

### Public release

- The interface contains no live-funds path before every relevant launch gate passes.
- No public claim exceeds the implemented and independently verified system.
