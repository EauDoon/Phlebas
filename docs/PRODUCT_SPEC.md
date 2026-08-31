# Phlebas Product Specification

Status: native-settlement target, no-value simulation
As of: 01-09-2026

## 1. Product statement

Phlebas is being built as a non-custodial spot exchange for native transparent ZEC against USDC and USDT. Display markets are `ZEC/USDC` and `ZEC/USDT`; settlement pairs are `ZEC-USDC` and `ZEC-USDT`. Settlement assets are native ZEC, native USDC, and native USDT. USDT0 is abandoned. It combines a professional offchain order book with one two-chain atomic-swap workflow per fill.

Users and liquidity providers keep control of their wallets. Phlebas cannot sign, redirect, claim, refund, or custody either asset.

The current public application is a simulation. It does not place real orders or submit transactions.

## 2. Version 1 scope

Version 1 includes:

* `ZEC/USDC` and `ZEC/USDT` market displays;
* native transparent ZEC settlement;
* one approved EVM network and exact stablecoin contract per market;
* signed limit and market orders;
* price-time matching with GTC, IOC, and FOK;
* one immutable atomic-swap plan per fill;
* wallet-controlled funding, claim, and refund;
* maker and solver liquidity held in provider wallets;
* deterministic receipts, replay, observation, and recovery;
* responsive web, mobile, and keyboard-accessible interfaces;
* public system, matcher, observer, and incident status.

USDC is the first quote candidate. Native USDT is listed. USDT0 is abandoned. Exact USDT contract identity remains unresolved until issuer, network, legal, and operational review.

## 3. Non-goals

Version 1 excludes:

* custody-backed ERC-20 receipts;
* platform customer balances;
* minting, burns, reserve wallets, deposits into Phlebas, or withdrawals from Phlebas;
* shielded atomic swaps;
* passive cross-chain LP shares;
* leverage, lending, liquidations, perps, options, farms, gauges, or token listings;
* hidden or discretionary fees;
* operator seizure or transaction substitution;
* an oracle-dependent settlement path.

The matcher is an operator and may omit or delay orders. Non-custodial does not mean trustless.

## 4. Users

### Trader

A trader can inspect the market, place a signed order, review each fill, fund or claim a swap, and recover through a wallet-controlled refund path.

### Maker or solver

A maker or solver publishes signed quotes backed by inventory that stays in its wallets until one swap is authorized. It can set capacity, price, fee, expiry, and inventory controls.

### Observer

An observer supplies read-only chain evidence. It has no signing capability.

### Operator

The operator runs the matcher and coordinator, publishes receipts and status, and applies fail-closed policy. It has no authority over funds.

## 5. Markets and units

| Display market | Base settlement | Quote settlement |
| --- | --- | --- |
| `ZEC/USDC` | Native transparent ZEC | Exact approved USDC contract |
| `ZEC/USDT` | Native transparent ZEC | Exact approved native USDT contract |

ZEC quantities use integer zatoshis with 8 decimals. Quote quantities use the exact token's integer base units. Price uses a versioned integer tick.

Every order ticket, confirmation, fill, and history record names the settlement pair `ZEC-USDC` or `ZEC-USDT`. Those pairs are native ZEC against native USDC or native USDT. USDT0 is not a listed quote asset. The undeployed 8-decimal receipt symbol is `tZEC`; product copy labels native ZEC. That is not live native-ZEC execution.

The reference ticket uses:

* `0.01` quote units per price tick;
* one zatoshi as the minimum base step;
* one quote-token base unit as the minimum settled notional.

All parsers reject exponent notation, extra precision, negative values, zero where positive is required, and values outside the configured integer range.

## 6. Signed order

An order binds:

```text
protocol version
maker identity
settlement recipient identities
side
base asset and Zcash network
quote asset, EVM chain, and exact token contract
base amount
limit price
time in force
nonce
account epoch
expiry
salt
maximum fee
allowed settlement route
verifying domain
```

EVM signatures use EIP-712. Zcash authorization uses a separate wallet-supported format. One signature never grants authority on both chains.

A market order is IOC with a signed worst acceptable price. There is no unbounded market order. A market worst price rounds outward to the next tick, up for buys and down for sells.

Contract wallets require ERC-1271 validation on the EVM path. That support remains a later contract milestone.

## 7. Matching

The matcher applies deterministic price-time priority.

It supports:

* GTC resting orders;
* IOC orders that cancel unfilled size;
* FOK orders that settle in full or reject atomically at the matching layer;
* partial fills;
* integer side-aware quote rounding;
* fee-cap validation;
* expiry;
* nonce bitmap cancellation;
* account-epoch invalidation;
* append-only intake and match receipts;
* deterministic event replay.

Every partial fill creates one separate swap plan. A match never updates a real balance.

Sequence receipts and checkpoints let users detect gaps or reordering. They do not force the matcher to include an order.

## 8. Atomic settlement

One fill creates immutable terms for two legs:

| Leg | Asset | Candidate lock | Funder | Claimant | Refund rule |
| --- | --- | --- | --- | --- | --- |
| Native | Transparent ZEC | Zcash P2SH conditional lock | ZEC seller | Stablecoin seller | Later deadline |
| Quote | USDC or selected native USDT | EVM exact-token conditional lock | Stablecoin seller | ZEC seller | Earlier deadline |

Both legs bind the same hash. The exact deadline margin is a versioned policy.

The workflow states are:

```text
matched
terms accepted
first funding prepared
first funded
first confirmed
second funding prepared
both funded
redeemable
settled
refundable
refunded
disputed
```

Required invariants:

* one fill maps to one swap identifier;
* asset, network, amount, recipient, hash, and deadlines never change;
* second-leg funding requires confirmed first-leg evidence;
* claims require the exact preimage;
* claim and refund are mutually exclusive for each leg;
* refunds require the applicable deadline;
* duplicate or conflicting evidence fails closed;
* wrong-chain, wrong-asset, stale, or reorganized evidence moves the workflow to disputed;
* every incomplete funded swap retains a wallet-controlled refund path;
* deterministic replay yields the same state and next safe action.

## 9. Liquidity

Version 1 uses maker and solver liquidity.

A signed quote binds:

* provider identity;
* both assets and networks;
* exact input and output limits;
* capacity;
* fee;
* expiry;
* recipients;
* pricing-policy version;
* settlement protocol version.

The provider may derive quotes from a constant-product curve. No funds enter a shared Phlebas pool. No LP token is issued.

The router compares complete executable routes only. It may choose an order-book fill, solver quote, or bounded combination when every resulting fill has a valid atomic-swap plan.

## 10. Trading journey

1. The user selects `ZEC/USDC` or `ZEC/USDT`.
2. The terminal shows book depth, recent trades, system status, settlement networks, and the exact quote asset.
3. The user selects side, type, price or worst price, size, time in force, fee limit, expiry, and allowed routes.
4. Review shows integer amounts, recipients, both networks, fees, refund rules, privacy effects, and matcher limits.
5. The correct wallet signs the order authorization.
6. The matcher returns an intake receipt and later a match receipt.
7. Each fill opens a settlement ticket.
8. The ticket shows the next safe wallet action and the evidence supporting it.
9. The user signs funding, claim, or refund transactions only after reviewing exact terms.
10. The ticket ends as settled, refunded, or disputed.

## 11. Settlement ticket

Every ticket shows:

* swap identifier and protocol version;
* order and fill receipt identifiers;
* exact ZEC and stablecoin amounts;
* stablecoin contract identity;
* both networks;
* both wallet recipients;
* shared hash;
* both deadlines and safety margin;
* expected fees;
* confirmation and finality state;
* current observer agreement;
* current required wallet action;
* claim or refund outcome;
* public-linkability warning for transparent ZEC.

The ticket never asks the user to deposit into Phlebas.

## 12. Wallet behavior

The wallet boundary accepts only explicit transaction artifacts or supported adapter calls.

Phlebas never asks for:

* a seed phrase;
* a private key;
* a spending key;
* a viewing key;
* a wallet database;
* an arbitrary message unrelated to the exact order;
* an unrestricted token approval.

Wallet compatibility requires executed tests for the exact release and the exact fund, claim, refund, fee, restart, and reorganization paths. ZIP 321 or TEX support alone is insufficient.

## 13. Required system states

The UI must represent:

* market data live, stale, unavailable, or empty;
* matcher available, degraded, or halted;
* Zcash observers agreeing, stale, or conflicting;
* EVM observers agreeing, stale, or conflicting;
* contract identity verified, unresolved, paused, or mismatched;
* wallet unsupported, disconnected, wrong network, ready, rejected, or failed;
* swap matched, funding, both funded, redeemable, refundable, settled, refunded, or disputed;
* incident active and recovery pending.

No unsafe state may enable a signing action.

## 14. Interface

The terminal uses a dense professional hierarchy inspired by major order-book venues without copying their assets, copy, or layout.

Desktop prioritizes chart, book, ticket, trades, and the active settlement ticket. Mobile prioritizes market status, order entry, signing review, and the refund path.

Controls meet keyboard, focus, semantic-table, touch-target, contrast, and reduced-motion requirements. The application has no horizontal page overflow at 320, 390, 768, and 1440 pixel widths.

Every signing action has a review step. Error messages identify the unsafe term or missing evidence and preserve the user's recovery path.

## 15. Public status

The status surface reports:

* release commit and protocol schema version;
* live-funds mode;
* wallet and contract availability;
* matcher sequence health;
* Zcash and EVM observer freshness and agreement;
* contract identity and pause state;
* swap queues by state;
* incident state.

Until approved integrations exist, status remains `liveFunds: false`, wallets disabled, contracts not deployed, and networks none.

## 16. Release acceptance

The no-value milestone needs:

* lint, type checking, unit tests, property tests, secret scan, build, and browser checks;
* independent current-byte review;
* an exact GitHub commit and Vercel preview;
* no key, live endpoint, real address, contract deployment, or transaction.

Testnet needs current protocol evidence, wallet execution, contract and transaction-builder review, observer recovery, legal approval, and a named authorization.

Mainnet needs successful Testnet operation, independent audits, verified contract bytecode, reproducible services, monitoring, incident drills, legal approval, exact deployment manifests, production key controls, and separate authorization for real assets.

## Simulation gateway (current public UI)

The public application still demos a no-value gateway tour. Cannot mint tZEC without a valid deposit attestation. One tZEC burn can produce at most one native payout. High-risk confirmations repeat The ZEC custody and redemption dependency. Nothing is minted or sent.

The simulation withdrawal walker is:

```text
requested -> screened -> burn submitted -> burn finalized -> payable
requested | screened -> rejected before burn with review reason
burn submitted -> expired or reorganized evidence -> closed without finalized burn
burn finalized | payable -> tZEC restored only on unrecoverable pre-signature failure
payable -> transaction_prepared -> signed -> broadcast -> mined -> confirmed
signed | broadcast | mined -> unresolved
unresolved -> exact committed transaction observed -> broadcast | mined
unresolved -> verified input restoration -> payable
```

A single-use refund authorization must permanently cancel the unpaid claim before restoring tZEC. Once a native transaction is signed, the claim cannot be refunded. The public simulation exposes each fail-closed and walker preview state as a clickable tour step on both ZEC-USDC and ZEC-USDT labels.
