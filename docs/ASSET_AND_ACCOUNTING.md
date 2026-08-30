# Phlebas Asset and Accounting Model

Status: Simulation only
As of: 30-08-2026

Phlebas has no real assets, customer accounts, reserve wallets, deployed tokens, bridge ledger, or operational custody today. The current application uses sample values. This document defines a candidate accounting model for review and testing. It does not authorize deposits, minting, trading, or withdrawals.

## Asset definitions

### Native ZEC

Native ZEC is the asset recorded on the Zcash blockchain. Phlebas's candidate gateway accepts transparent ZEC only. Transparent transaction data is public, as described by [Zcash](https://z.cash/learn/what-is-the-difference-between-shielded-and-transparent-zcash/).

The deposit interface would use ZIP 320 `tex...` addresses. [ZIP 320](https://zips.z.cash/zip-0320) requires conforming wallets to fund these outputs with transparent UTXOs, but the restriction is not a consensus rule. The bridge must validate the final transaction itself.

### pZEC

`pZEC` means Phlebas ZEC. It is a proposed custody-backed ERC-20 representation of transparent native ZEC.

One `pZEC` would represent a contractual redemption claim for one ZEC, subject to the published withdrawal rules. `pZEC` would have 8 decimals to preserve ZEC's zatoshi unit. It would not provide Zcash shielding, native Zcash finality, trustless redemption, or protection from custody failure.

`pZEC` is only a display and simulation label today. No token contract exists.

### USDC

The candidate USDC quote asset is native Circle USDC on Arbitrum One. Circle lists the current Arbitrum mainnet address in its [official USDC contract registry](https://developers.circle.com/stablecoins/usdc-contract-addresses). No address is approved for Phlebas configuration until the mainnet gate revalidates it.

### USDT0

The interface uses `USDT0` as the candidate settlement label for the displayed `ZEC/USDT` market. The [USDT0 deployment registry](https://docs.usdt0.to/technical-documentation/deployments) lists the Arbitrum One token and OFT integration addresses. No address is approved for Phlebas configuration until the mainnet gate revalidates the token, OFT path, decimals, bytecode, and control structure.

### LP shares

Each candidate constant-product pool would issue a fungible ERC-20 LP share representing a proportional claim on that pool's reserves. [Uniswap's protocol description](https://developers.uniswap.org/docs/get-started/concepts/how-uniswap-works) describes this v2 model. Phlebas has no LP token or pool contract today.

## Units and precision

All ledger and contract amounts use unsigned integers in the asset's smallest unit.

| Asset | Candidate decimals | Smallest unit |
| --- | ---: | --- |
| Native ZEC | 8 | zatoshi |
| `pZEC` | 8 | pzatoshi, equal in scale to one zatoshi |
| USDC | 6 | token base unit |
| USDT0 | 6 | token base unit |
| LP share | Contract-defined | token base unit |

Floating-point numbers are prohibited for balances, fills, fees, reserves, minting, burns, and withdrawals. Display rounding never changes the ledger amount.

## Books and account classes

The bridge ledger uses double-entry accounting. Blockchain data is evidence for an entry, not a substitute for the ledger.

| Account | Class | Normal balance | Purpose |
| --- | --- | --- | --- |
| Native ZEC reserve | Asset | Debit | Confirmed spendable custody UTXOs |
| Native withdrawal in transit | Asset | Debit | Signed, broadcast, or mined native payments awaiting the close threshold |
| Unconfirmed custody change | Asset, excluded from coverage | Debit | Change to an approved custody script that is signed, broadcast, or mined but not yet confirmed and spendable |
| Unresolved withdrawal principal | Memorandum, excluded from coverage | None | Principal in an invalid, stale, conflicted, or reorganized committed transaction awaiting proof-gated recovery |
| Provisional ZEC deposit | Memorandum | None | Observed deposits below the confirmation threshold |
| Confirmed deposit entitlement | Liability | Credit | Confirmed ZEC received but not yet represented by `pZEC` |
| Outstanding pZEC | Liability | Credit | Total redeemable `pZEC` supply |
| Native withdrawal payable | Liability | Credit | Finalized burns awaiting native ZEC payment |
| ZEC network fee expense | Expense | Debit | Native network cost paid by the operator, if not passed through |
| Withdrawal fee revenue | Revenue | Credit | Disclosed service fee, if approved |
| Custody surplus | Equity or operator liability | Credit | Operator-owned ZEC that is not customer backing |
| Reconciliation suspense | Liability | Credit | Unresolved difference that blocks bridge operations |

Pool reserves and user token balances remain on Arbitrum in the candidate design. Indexers maintain derived views, but contract balances and events are the settlement record for trading. The bridge ledger remains the record for the native ZEC reserve and `pZEC` redemption obligation.

## Core quantity model

All terms below are integer zatoshis or pzatoshis at the same 8-decimal scale.

* `A` is confirmed native ZEC in controlled, spendable, and uncommitted custody UTXOs. Once a transaction is committed, the full selected input value leaves `A`.
* `T` is customer payout principal in valid signed, broadcast, or mined withdrawal transactions that have not reached the close threshold. Every unit in `T` must be matched one-to-one to the same open payable in `W`. It is settlement in transit, not reusable reserve.
* `U` is principal in an invalid, stale, conflicted, or reorganized committed transaction. It receives no coverage credit, remains linked to `W`, and forces incident halt until resolved.
* `C` is change to an approved custody script in a signed, broadcast, mined, or unresolved committed transaction. It is tracked for attribution but receives a 100 percent coverage haircut until confirmed and spendable.
* `I` is the full value of custody inputs selected for one committed withdrawal transaction.
* `P` is that transaction's customer payout principal and exact increase in matched `T`.
* `N` is that transaction's network fee.
* `S` is total outstanding `pZEC` supply.
* `D` is confirmed deposit entitlement not yet minted.
* `W` is finalized burn value owed through native withdrawals.
* `O` is any other customer ZEC liability.
* `B` is the required operator-funded reserve buffer, at least 1 percent of customer liabilities under the canary design.
* `F` is operator-owned ZEC equity that is segregated from customer backing and must be at least `B`.

The required controlled-reserve invariant is:

```text
0 <= T <= W
A >= S + D + (W - T) + O + B
A + T >= S + D + W + O + B
I = P + C + N
```

The attribution reconciliation is:

```text
A + T + U + C = S + D + W + O + F + reconciliation_difference
```

`reconciliation_difference` must equal zero. Any nonzero value halts minting and moves withdrawals into incident policy. `U` and `C` appear only in attribution. Neither counts toward either coverage inequality. `C` moves into `A` only when confirmed and spendable. Operator-owned ZEC cannot be counted twice as customer backing. Unconfirmed deposits, unspendable outputs, and disputed outputs are excluded.

`T` may offset only its exact matching payable. It cannot cover `S`, `D`, `O`, the buffer, or another withdrawal. Before signing, the gateway simulates the full post-broadcast state. It removes `I` from `A`, adds `P` to the matching `T`, records `C` with a full coverage haircut, and recognizes `N` under the approved fee policy. It refuses to sign unless `I = P + C + N`, both coverage inequalities hold, and the network fee has an explicitly assigned funding entry. A large input with unconfirmed change can therefore fail the pre-sign coverage gate even when its eventual change would restore coverage.

An ordinary fully reserved withdrawal therefore remains solvent through each state. In this simplified example, all values are ZEC, the operator keeps a 1 ZEC buffer, and the signer selects an exact 10.10 ZEC input for 10 ZEC of principal plus a 0.10 ZEC operator-funded network fee:

| State | `A` | `S` | `W` | `T` | `C` | Required controlled reserve | Coverage assets `A + T` |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Before burn | 101.10 | 100 | 0 | 0 | 0 | 101 | 101.10 |
| Burn finalized | 101.10 | 90 | 10 | 0 | 0 | 101 | 101.10 |
| Principal broadcast | 91 | 90 | 10 | 10 | 0 | 91 | 101 |
| Native payment closed | 91 | 90 | 0 | 0 | 0 | 91 | 91 |

The broadcast row is valid because the full 10.10 ZEC input leaves `A`, the 10 ZEC principal enters only its matching `T`, and the 0.10 ZEC fee is recognized separately. Selecting one 101.10 ZEC input with 91 ZEC of change would fail this pre-sign coverage gate because the change cannot count before confirmation.

## Deposit lifecycle

The candidate deposit state machine is:

```text
expected -> observed -> provisional -> confirmed -> mint_authorized -> minted
                                      -> quarantined
                                      -> orphaned
```

State transitions are monotonic except for explicit chain reorganization handling. Every transition records its source block hash, height, timestamp, policy version, and actor or service identity.

### Observed and provisional

An observed output creates no asset or liability entry. It creates a memorandum record keyed by `(network, txid, vout)`. The amount remains unavailable for trading or withdrawal.

The validator checks:

* the expected TEX receiver and underlying P2PKH script;
* a positive integer zatoshi amount;
* no prior record for the outpoint;
* a transparent-only final transaction;
* the block hash and height reported by the configured Zebra observers.

### Confirmed

External deposits use at least 10 confirmations in development and testnet. [Draft ZIP 315](https://zips.z.cash/zip-0315) recommends 10 confirmations for untrusted outputs. The restricted-mainnet canary design starts at 100 confirmations and at least two hours, whichever is later. [ZIP 203](https://zips.z.cash/zip-0203) says services must never rely on zero-confirmation Zcash transactions.

When the threshold is met and observers agree:

```text
Debit  Native ZEC reserve
Credit Confirmed deposit entitlement
```

### Minted

Minting requires a unique authorization bound to the confirmed outpoint, amount, recipient, Arbitrum chain ID, `pZEC` contract, and expiry. The same outpoint cannot authorize a second mint.

After the Arbitrum mint event reaches its configured finality condition:

```text
Debit  Confirmed deposit entitlement
Credit Outstanding pZEC
```

The ledger compares the event amount with the authorized amount. A difference enters reconciliation suspense and stops the bridge.

## Withdrawal lifecycle

The candidate withdrawal state machine uses the canonical names in [PRODUCT_SPEC.md](./PRODUCT_SPEC.md) section 9.3.

| Canonical name | Previous accounting name | Meaning |
| --- | --- | --- |
| burn submitted | burn_observed | Unfinalized Arbitrum burn event |
| transaction_prepared | (unnamed) | Unsigned native payout after `payable` |
| closed | closed | Ledger close after `confirmed` |
| refunded | refunded | Pre-signature pZEC restoration after the payable is cancelled |

```text
requested -> screened -> burn submitted -> burn finalized -> payable
payable -> transaction_prepared -> signed -> broadcast -> mined -> confirmed -> closed
requested | screened -> rejected before burn
burn submitted -> expired or reorganized evidence -> closed without finalized burn
burn finalized | payable -> refund authorized on unrecoverable pre-signature failure -> refunded
signed | broadcast | mined -> unresolved
unresolved -> exact committed transaction observed -> broadcast | mined
unresolved -> verified input restoration -> payable
```

### Burn finalized

A withdrawal begins from one unique Arbitrum burn event. The first implementation does not use escrow to create a payout liability. Native ZEC is not released from an unfinalized event.

```text
Debit  Outstanding pZEC
Credit Native withdrawal payable
```

This transition lowers token supply but preserves the customer obligation until native payment closes it.

An unrecoverable failure before signature commitment may restore pZEC through one single-use refund authorization. The refund permanently cancels the native payable before restoration. Once a native transaction is signed, restoration is forbidden because the signed payout may later be broadcast. A withdrawal claim can never be both refunded and paid.

### Native withdrawal signed and broadcast

Immediately before the signature can leave the signer boundary, the coordinator durably records the exact serialized transaction, its canonical transaction ID, expiry height, selected outpoints, and following journal. The ledger removes the full selected input while the matching payable remains open:

```text
Debit  Native withdrawal in transit     P
Debit  Unconfirmed custody change        C
Debit  ZEC network fee expense           N
Credit Native ZEC reserve                I
```

The journal must satisfy `I = P + C + N`. The `signed` state survives coordinator and signer restarts, prevents input reselection, and uses the same coverage treatment as `broadcast`. Its canonical transaction ID enters an append-only commitment history before release. No active, restored, or closed claim may reuse that ID. Broadcasting the exact persisted bytes changes status but creates no second financial entry. While that commitment remains active, every retry rebroadcasts only those bytes and the coordinator cannot substitute a different transaction. A proof-gated restoration closes that commitment before the payable claim can receive a new transaction with a new ID.

An invalid, stale, conflicted, or reorganized transaction moves to `unresolved`. Its principal moves from `T` to `U`, immediately loses all coverage credit, keeps full `I` excluded from `A`, keeps `C` excluded, and forces incident halt. An independently observed broadcast or mined transaction may restore the principal to `T` only when its transaction ID exactly matches the ID derived from the persisted serialized transaction. A wrong, replacement, or reconstructed transaction ID is rejected. The full entry reverses only after independent observers prove that all selected inputs are again spendable and the signed transaction can no longer confirm under the custody policy. Signature material is destroyed according to the key-management procedure only after that proof; destruction alone is not evidence that no copy can be broadcast. Until both conditions hold, none of the input, change, or fee returns to coverage and the payable remains open under incident policy.

Incident halt blocks every new withdrawal signature. Under the approved recovery policy, the coordinator may still rebroadcast exact bytes already committed, record the exact committed transaction becoming broadcast or mined, advance that same transaction through confirmation, or apply independently verified input restoration. Those transitions reduce ambiguity; they do not authorize a different payout transaction.

The resulting state must satisfy `0 <= T <= W` and `A >= S + D + (W - T) + O + B`. A transaction in `T` that becomes invalid, stale, conflicted, or unmatched immediately loses eligibility to offset `W`. The gateway may restore the full selected input to `A` only after independent observers confirm both that the inputs are spendable by custody again and that the signed transaction cannot confirm. Until both are proven, the difference remains under incident policy and no new mint or withdrawal may proceed.

### Native withdrawal confirmed

After the Zcash withdrawal reaches the configured confirmation threshold and its custody change is spendable:

```text
Debit  Native ZEC reserve                C
Debit  Native withdrawal payable         P
Credit Unconfirmed custody change         C
Credit Native withdrawal in transit       P
```

Network and service fees are separate entries. The customer must see and approve the fee method before the burn. Phlebas must not hide fees in an exchange rate or silently reduce the withdrawal after authorization.

[ZIP 317](https://zips.z.cash/zip-0317), last updated 26-06-2026, defines the current conventional Zcash fee formula by logical actions. The signer must calculate the transaction-specific fee and verify it again before signing.

## Reorganizations

### Zcash deposit reorganization

If a provisional deposit is orphaned, the memorandum record moves to `orphaned` and creates no financial entry.

If a confirmed but unminted deposit is orphaned:

```text
Debit  Confirmed deposit entitlement
Credit Native ZEC reserve
```

If an already minted deposit is orphaned, the bridge cannot reverse tokens held by unrelated users without an explicit contract power. Minting and withdrawals halt. The deficit enters reconciliation suspense, affected accounts are isolated where the approved policy allows, and incident response begins.

### Arbitrum reorganization

Unfinalized mint and burn events can be removed and replayed. Event consumers key records by chain ID, transaction hash, log index, contract address, and block hash. Only finalized events create bridge accounting entries.

A native withdrawal must never be signed from an unfinalized burn. If a finalized burn is later displaced under the selected threat model, the bridge halts and reconciles before another native transaction is signed.

## Order book accounting

An order is not an asset transfer. It creates a bounded authorization or contract hold, depending on the approved settlement design.

The order record contains:

* market and settlement asset addresses;
* side, limit price, original quantity, and remaining quantity;
* maker, nonce, expiry, chain ID, and contract domain;
* fee limit and signature;
* cancellation and fill state.

A fill transfers quote and base assets between users through the settlement contract. It does not change `pZEC` total supply or native ZEC reserves. Partial-fill arithmetic rounds in the direction defined by the contract and never creates a negative remaining quantity.

The matching service cannot create balances. Derived order-book views reconcile to accepted orders, cancellations, expiries, and settlement events.

## Pool accounting

Each pool has two token reserves and one LP share supply. For a pool with reserves `x` and `y`, swaps use the candidate constant-product invariant:

```text
x * y >= k_before
```

The inequality accounts for fees retained by the pool. Contract code must use integer arithmetic with explicit rounding. The current interface's fee, TVL, volume, and reserve figures are simulations.

Adding liquidity transfers both assets into the pool and mints LP shares. Removing liquidity burns shares and transfers the proportional reserves. Neither action changes `pZEC` supply or the native reserve obligation.

## Fees

Every fee has an asset, payer, recipient, calculation basis, rounding rule, and ledger account.

Candidate fee categories are:

* CLOB settlement fee;
* AMM swap fee paid into pool reserves;
* transparent Zcash network fee;
* disclosed native withdrawal service fee;
* emergency or manual-review fees only if separately approved and disclosed.

Simulation values do not set mainnet fees. Fee parameters require a separate economic and legal decision.

## Reconciliation controls

The bridge runs these checks before each mint and single-claim withdrawal transaction and at least daily. The first implementation does not batch multiple payout claims into one Zcash transaction.

1. Derive confirmed reserve UTXOs from two agreeing Zebra observers.
2. Reconcile every reserve outpoint to the custody ledger.
3. Read `pZEC` total supply from the configured Arbitrum contract and finalized block.
4. Reconcile all confirmed deposit entitlements and native withdrawal payables.
5. Confirm every selected input is removed from `A` in full and every transaction satisfies `I = P + C + N`.
6. Confirm every in-transit principal is matched to its exact payable, all unconfirmed change remains excluded, `0 <= T <= W`, `A >= S + D + (W - T) + O + B`, and `A + T >= S + D + W + O + B`.
7. Confirm every unresolved principal is excluded from `T`, all unresolved states force incident halt, `A + T + U + C = S + D + W + O + F + reconciliation_difference`, and `reconciliation_difference = 0`.
8. Confirm no outpoint, mint authorization, burn event, or native withdrawal appears more than once.
9. Confirm all configured chain IDs, contracts, decimals, and admin identities match the approved manifest.

A failed check stops minting and withdrawals. Trading may also stop if continued transfers could increase customer loss.

## Reserve disclosure

Transparent Zcash makes reserve outpoints observable, but observation alone does not prove control, absence of hidden liabilities, or correct attribution. A mainnet reserve program would need:

* published reserve addresses or outpoints;
* a signed proof of control using an approved method;
* published `pZEC` supply and bridge liabilities at the same cutoff height;
* treatment of pending deposits and withdrawals;
* an independent attestation process;
* a clear statement that an attestation is not a guarantee against future loss.

No Phlebas proof of reserves or attestation exists today.

## Customer disclosures

Before any mainnet interaction, the interface must state:

* `pZEC` is custody-backed and is not native ZEC;
* deposits and withdrawals support transparent Zcash only;
* transparent Zcash activity is public;
* redemption depends on the custody operator, signer availability, chain operation, and approved withdrawal policy;
* deposits may wait for more confirmations based on value or network conditions;
* contracts may include approved pause or recovery powers, with the exact powers disclosed;
* USDC and USDT0 remain subject to their issuers and contract controls;
* the current application is a simulation until the mainnet gate passes.

## Mainnet accounting gate

Real assets remain prohibited until the following exist and have explicit approval:

* an incorporated accounting policy reviewed for the operating jurisdiction;
* exact custody, customer-asset, revenue, expense, and equity account treatment;
* audited bridge contracts and an approved admin-key policy;
* tested double-entry ledger software with immutable event history;
* independent reconciliation against Zebra and Arbitrum;
* value-based confirmation and withdrawal limits;
* reorganization, insolvency, key-loss, and contract-incident procedures;
* reserve disclosure and independent attestation terms;
* a migration and redemption plan if `pZEC` is paused or retired;
* explicit authority to create reserve wallets, deploy contracts, and take custody.
