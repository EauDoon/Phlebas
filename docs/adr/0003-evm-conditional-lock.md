# ADR 0003: Exact-token EVM conditional lock

Date: 01-09-2026
Status: Accepted for key-independent local development
Deployment status: Not deployed or approved for deployment

## Context

ADR 0002 defines one two-chain atomic swap for each matched fill. The native ZEC leg uses a transparent Zcash conditional lock. The EVM leg holds the exact stablecoin amount. Both legs bind the same SHA-256 digest, while their claim and refund windows leave time for the safe cross-chain sequence.

This repository can build and test the EVM primitive without a wallet, key, signature, RPC call, broadcast, or live asset. The contract must remain useful as a local reference while failing closed if any fill identity, role, asset, amount, hash, deadline, or token transfer is wrong.

## Decision

Deploy one non-upgradeable `ConditionalLock` instance for one matched fill. Every economic term is immutable. The contract starts unfunded and has only three state-changing methods: `fund`, `claim`, and `refund`.

### Immutable terms

| Field | Meaning | Constructor constraint |
| --- | --- | --- |
| `swapId` | Cross-chain fill identity | Nonzero `bytes32` |
| `termsHash` | Commitment to the canonical full swap terms | Nonzero `bytes32` |
| `token` | Exact ERC-20 contract for this fill | Nonzero address with deployed code |
| `funder` | Wallet that supplies the EVM asset | Nonzero and distinct from `claimRecipient` |
| `claimRecipient` | Only wallet allowed to claim | Nonzero and distinct from `funder` |
| `refundRecipient` | Fixed refund destination | Must equal `funder` |
| `amount` | Exact token units for this fill | Greater than zero |
| `hashlock` | SHA-256 commitment to the preimage | Nonzero `bytes32` |
| `fundingCutoff` | Last timestamp at which funding is allowed | Future timestamp before `claimCutoff` |
| `claimCutoff` | Last timestamp at which claiming is allowed | After `fundingCutoff` and before `refundTime` |
| `refundTime` | First timestamp at which refund is allowed | After `claimCutoff` |

The constructor also rejects any role that equals the token or the lock itself. The contract cannot determine whether a role wallet is usable or whether an issuer may later block it. The signing surface must show and verify every immutable value before funding.

`termsHash` is an opaque cross-chain commitment. The contract proves that the supplied commitment never changes, but it does not recompute the full offchain terms. The canonical terms encoder, matcher, observer, and wallet must independently confirm that the commitment matches the same fill.

### State machine

| Current state | Method | Caller | Time rule | Next state |
| --- | --- | --- | --- | --- |
| `Unfunded` | `fund()` | `funder` | `block.timestamp <= fundingCutoff` | `Funded` |
| `Funded` | `claim(bytes32)` | `claimRecipient` | `block.timestamp <= claimCutoff` and preimage valid | `Claimed` |
| `Funded` | `refund()` | `funder` | `block.timestamp >= refundTime` | `Refunded` |

The interval after `claimCutoff` and before `refundTime` is a deliberate safety gap. Neither claim nor refund is available there. `Claimed` and `Refunded` are terminal and mutually exclusive. A second funding call and every terminal replay revert.

The contract does not prove that the native ZEC leg was funded or claimed. The coordinator, observers, and wallets enforce the cross-chain ordering. They never receive authority to sign or submit a user's transaction.

### Hashlock

The lock verifies `sha256(abi.encode(preimage)) == hashlock` for one fixed `bytes32` preimage. This is the same 32-byte input representation used by the transparent Zcash script design. Keccak-256 is not used for the cross-chain hashlock.

The claim transaction necessarily reveals the preimage in calldata. The contract does not repeat it in an event. Observers read the transaction input only after the user has chosen to submit it.

### Exact token accounting

The token address cannot change after construction. `fund` uses OpenZeppelin `SafeERC20.safeTransferFrom`. `claim` and `refund` use `SafeERC20.safeTransfer`. OpenZeppelin Contracts is pinned to version `5.6.1`.

Every transfer also checks balance deltas:

1. Funding must increase the lock balance by exactly `amount`.
2. Claim or refund must reduce the lock balance by exactly `amount`.
3. The fixed recipient balance must increase by exactly `amount`.

False returns, malformed returns, transfer reverts, no-op success, fee-on-transfer behavior, and reentrant callbacks fail or roll back. Legacy tokens that return no value can succeed only when the observed deltas are exact.

An unsolicited token transfer may leave surplus tokens in the contract. Surplus does not change the exact fill payout and cannot block funding through a zero-balance precondition. There is no sweep or rescue method, so unsolicited surplus remains unreachable. Observers must account for it separately and must never treat it as fill value.

Issuer controls remain outside the contract's control. A stablecoin proxy upgrade, pause, denylist, or account freeze can prevent funding or payout. Immutable token identity prevents substitution, not issuer intervention.

### Interaction surface

All three state-changing methods use OpenZeppelin `ReentrancyGuard`. State becomes terminal before the outgoing token call, and a revert restores both state and balances.

The contract has no proxy, upgrade hook, owner, governor, pauser, oracle, callback, native-value receiver, fee, fee recipient, seizure, allowance grant, arbitrary recipient, arbitrary token, rescue, or sweep surface. It does not execute a supplied target and does not call either user role.

### Events

| Event | Purpose |
| --- | --- |
| `LockCreated` | Publishes all immutable terms once at construction |
| `Funded` | Records the exact token amount accepted from the funder |
| `Claimed` | Records the fixed recipient and exact amount, without the preimage |
| `Refunded` | Records the original funder and exact amount |

### Identity and deployment records

`swapId` identifies the fill inside one contract instance. Independent instances can be constructed with the same `swapId`; there is no global onchain registry. Duplicate prevention therefore belongs to the deterministic deployment policy and observer index. A duplicate, conflicting, or absent deployment record is a stop condition.

The versioned manifest schema records the exact source commit, compiler and optimizer settings, dependency version, constructor values, creation bytecode hash, runtime bytecode hash, transaction evidence, and verification status. The checked-in record is `deployed: false`, disables network action, and uses null for every absent chain value. It contains no sample address or transaction that could be mistaken for a deployment.

## Alternatives considered

### One contract holding many locks

Rejected. A mapping and sequential counter enlarge the state and replay surface. One instance per fill makes every token, role, amount, and deadline immutable and removes recipient or token selection from later calls.

### Permissionless claim

Rejected. A public caller could copy the revealed preimage. The fixed `claimRecipient` must call and receive the claim.

### Arbitrary refund recipient

Rejected. The only refund caller and recipient is the original funder. This removes refund redirection from the constructor and call surface.

### Admin pause or rescue

Rejected. These controls add authority over a user's settlement state or balance. A new contract and new review are required for any future behavior change.

### Zero-balance funding precondition

Rejected. Anyone can transfer tokens directly to a contract and permanently block funding if zero balance is required. Exact before-and-after deltas preserve the fill amount without adding a griefing switch.

## Consequences

The EVM primitive can lock and release only the exact immutable ERC-20 amount. It cannot verify the Zcash transaction, enforce global `swapId` uniqueness, prove the offchain `termsHash` encoding, reverse an issuer freeze, or recover unsolicited tokens.

The TypeScript ABI must match the one-instance methods and eleven constructor arguments. Any ABI, source, dependency, compiler, setting, constructor, creation bytecode, or runtime bytecode change creates a different review and verification target.

## Required verification

Local acceptance requires:

* unit tests for terms, roles, happy paths, and terminal replay;
* exact funding, claim, safety-gap, and refund deadline tests;
* malicious-token and reentrancy tests;
* fuzz tests for amounts, preimages, and timelines;
* stateful invariants for conservation and terminal exclusivity;
* gas ceilings for deployment, funding, claim, and refund;
* TypeScript selector, event, constructor, and calldata vectors;
* a deterministic undeployed manifest validation;
* independent P0, P1, and P2 review of the exact final commit.

## Deployment gate

No deployment is authorized by this ADR. A later testnet or mainnet action requires an exact approved network, token contract, constructor packet, wallet, source commit, compiler environment, bytecode evidence, review result, and deployment procedure. It also requires live-chain stablecoin identity checks, Zcash-leg completion, wallet testing, legal and compliance approval, and explicit user authorization.

Until every gate is satisfied, all deployment records remain false and every network-action path remains disabled.
