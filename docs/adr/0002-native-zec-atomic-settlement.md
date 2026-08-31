# ADR 0002: Native ZEC Atomic Settlement

Date: 31-08-2026
Status: Accepted for key-independent development
Production status: Not approved

## Context

Phlebas is intended to become a non-custodial exchange for native transparent ZEC against USDC and USDT. Users must keep unilateral control of their keys. Phlebas must not mint a ZEC receipt, maintain a customer balance, control a payout key, or depend on an operator promise to redeem ZEC.

ADR 0001 selected custody-backed `pZEC` so the order book and a Uniswap v2 style pool could share one EVM state. That design cannot satisfy the revised requirement. A wrapped claim backed by an operator-controlled ZEC reserve is custodial even when its EVM transfers are onchain.

The current public application remains a no-value simulation. It has no wallet connection, chain client, contract, node, key, or real asset.

## Decision

Each matched fill will become one two-chain atomic-swap workflow:

1. The matcher creates immutable terms for one fill. The terms bind both parties, both assets, both networks, integer amounts, recipients, the shared hash, refund deadlines, fee limits, and the protocol version.
2. The native-ZEC leg uses a transparent Zcash P2SH conditional lock. The claim path requires the matching preimage and recipient signature. The refund path returns control to the funder after its lock time.
3. The stablecoin leg uses a non-upgradeable EVM conditional-lock contract for the exact approved token. Its claim and refund paths use the same hash and a shorter deadline.
4. Independent read-only observers report funding, confirmation, claim, refund, replacement, and reorganization evidence. They never sign or control funds.
5. A coordinator records deterministic state and tells each wallet which action is safe. It cannot change terms or spend either leg.
6. The user or solver signs every funding, claim, and refund transaction in its own wallet boundary.

The [Zcash protocol specification](https://zips.z.cash/protocol/protocol.pdf) states that transparent addresses include P2SH and that BIP 16 and BIP 65 apply from the Zcash genesis block. [ZIP 300](https://zips.z.cash/zip-0300) gives a candidate transparent atomic-swap construction with a hash-protected claim branch and a lock-time refund branch. [BIP 65](https://github.com/bitcoin/bips/blob/master/bip-0065.mediawiki) defines `OP_CHECKLOCKTIMEVERIFY` lock-time semantics. Exact scripts, relay policy, transaction construction, and wallet interoperability still require current test evidence before any chain action.

The EVM order authorization uses [EIP-712](https://eips.ethereum.org/EIPS/eip-712) domain separation and deterministic structured-data hashing. Any deployed stablecoin contract identity must come from its current issuer registry. Circle currently publishes the [USDC contract registry](https://developers.circle.com/stablecoins/usdc-contract-addresses). USDT and USDT0 remain unresolved until the product selects one exact asset and verifies its current issuer and deployment records.

## Order-book role

The order book is an offchain coordination service. It can sequence signed orders, match price-time priority, produce receipts, and propose settlement terms. It cannot move funds or declare a match settled.

Every partial fill creates a separate swap identifier and separate conditional locks. `matched`, `funded`, and `settled` are different states.

Market orders remain IOC orders with a signed worst price. A matcher may omit or delay an order, so sequence receipts and externally checkable checkpoints remain required.

## Liquidity role

Native ZEC and an EVM token do not share one contract state. A standard Uniswap v2 pool and passive fungible LP shares are outside this architecture.

Liquidity comes from makers or solvers that keep ZEC and stablecoin inventory in their own wallets. They may publish signed quotes from a constant-product pricing curve. Each accepted quote still settles through one atomic swap. Phlebas must call this solver liquidity or curve-priced maker liquidity, not a Uniswap v2 pool.

Passive LP shares remain on HOLD unless a separately reviewed protocol supplies non-custodial shared state across both chains without a wrapped or operator-controlled ZEC claim.

## Wallet boundary

Phlebas may prepare or relay a reviewable transaction artifact. It must never request a seed phrase, spending key, private key, viewing key, wallet database, or blind signature.

ZIP 321 payment requests and TEX addresses do not authorize P2SH atomic-swap scripts. Wallet compatibility requires executed tests for the exact fund, claim, and refund transactions. The current [Zallet PCZT documentation](https://zcash.github.io/zallet/rpc/index.html) provides transaction construction, inspection, signing, and extraction roles, but Phlebas must prove the selected P2SH path works with a current wallet release before labeling it compatible.

## Deterministic safety rules

The local domain and later contracts must enforce these rules:

* one fill creates one immutable swap identifier;
* both legs use the same approved hash function and digest;
* the Zcash refund deadline is later than the EVM refund deadline by an approved safety margin;
* second-leg funding cannot proceed until first-leg evidence meets the configured confirmation policy;
* claims require the exact preimage;
* claim and refund are mutually exclusive terminal outcomes for each leg;
* a refund cannot occur before its chain-specific deadline;
* duplicate or conflicting transaction evidence fails closed;
* stale observers, observer disagreement, reorganization, wrong-chain evidence, or wrong-asset evidence moves the workflow to a disputed state;
* every incomplete swap retains a wallet-controlled refund path;
* no environment variable can enable mainnet or real assets by itself.

## Deployment boundary

Vercel may host the public interface, static documentation, read-only status, and client-side preparation of unsigned terms. Vercel must not host wallet keys, signing services, private node credentials, an authoritative swap journal, or a transaction coordinator that can spend funds.

Persistent matcher, observer, coordinator, and watchtower services require separate infrastructure. Their credentials and endpoints stay outside the public application and repository.

## Key-independent work

Development may continue without any wallet or deployment key:

* versioned order and swap schemas;
* Ethereum Keccak and EIP-712 vectors;
* deterministic matching, receipts, cancellation, and replay;
* atomic-swap state machines and adversarial timeout tests;
* curve-priced solver quotes;
* wallet adapter interfaces and unsigned fixture artifacts;
* EVM contracts and local test chains;
* Zcash script builders and local script vectors;
* observer and coordinator interfaces;
* UI, accessibility, CI, release controls, and incident tests.

Missing keys block only the exact signing, broadcast, or deployment action that needs them.

## Release gates

Testnet remains blocked until all applicable items below pass:

* current primary-source verification of the selected Zcash script and transaction rules;
* executed wallet tests for funding, claim, and refund paths;
* approved Zcash and EVM deadline construction;
* exact USDC and USDT or USDT0 asset selection;
* independent review of both chain transaction builders and the EVM contract;
* deterministic, property, fuzz, timeout, replacement, and reorganization tests;
* persistent observer and coordinator recovery tests;
* legal and compliance approval for the named venue, assets, users, and jurisdictions;
* explicit approval for the testnet action.

Mainnet and real assets require a separate decision after testnet evidence, independent audits, recovery drills, exact deployment manifests, verified bytecode, monitoring, incident controls, and explicit approval.

## Consequences

Phlebas can pursue native-ZEC settlement without custody-backed `pZEC`. Trading has cross-chain latency and one workflow per fill. Solver liquidity replaces passive pooled LP shares. Shielded ZEC atomic swaps are outside version 1 because the selected conditional-lock path uses the transparent pool.

ADR 0001 remains useful as a historical simulation record. Its mint, reserve, burn, deposit, withdrawal, and custody design is no longer the active target.

## Implementation cross-references

- [ADR 0003](0003-evm-conditional-lock.md) — the EVM half of the swap.
- [ADR 0004](0004-atomic-swap-state-machine.md) — the offchain state machine and the read-only `/swap` view.
- [ADR 0005](0005-zcash-p2sh-atomic-swap.md) — the ZEC half of the swap.
- [ADR 0005 implementation notes](0005-impl-notes.md) — the operational cross-references for the ZEC half.
