# ADR 0003: EVM Conditional Lock Contract

Date: 01-09-2026
Status: Accepted for key-independent development
Production status: Not approved

## Context

ADR 0002 defines the target settlement shape: one two-chain atomic swap per matched fill, with a transparent Zcash P2SH lock on the native leg and a non-upgradeable EVM conditional lock on the stablecoin leg. The two legs share one hash, one preimage, staggered refund deadlines, and mutually exclusive terminal outcomes.

The current repository has no Zcash transaction builder, no EVM conditional lock contract, no wallet adapter, no chain client, and no real assets. The onchain settlement surfaces that are present (`Settlement.sol`, `Pair.sol`, `Router.sol`, `PZec.sol`) implement the superseded custody-backed pZEC design and remain as legacy simulation and testnet code only.

The EVM conditional lock is the only piece of the atomic-swap workflow that can be implemented and adversarially tested without a wallet key, a deployer key, or a live chain. Implementing it now gives the rest of the swap state machine and the wallet adapter a concrete contract to call, a deterministic ABI, and a complete failure-mode test surface.

## Decision

Add a new non-upgradeable EVM contract `ConditionalLock` under `contracts/src/swap/` that holds exactly one ERC-20 stablecoin deposit per lock, releases the deposit to a fixed counterparty on a correct preimage, and returns the deposit to the funder after a chain-local refund deadline.

### Lock shape

One lock is the entire EVM state for one matched fill.

| Field | Meaning | Constraint |
| --- | --- | --- |
| `depositor` | EVM address that funded the lock | Set from `msg.sender` at deposit |
| `token` | Approved stablecoin contract | Must equal `usdc` or `usdt0` |
| `amount` | Token units locked | Strictly positive |
| `hashlock` | SHA-256 of the preimage | Strictly non-zero |
| `refundAfter` | Unix timestamp after which `refund` is allowed | Must exceed `block.timestamp + MIN_REFUND_DELAY` at deposit |
| `refundTo` | Recipient of the refund | Strictly non-zero |
| `claimTo` | Recipient of the claim | Strictly non-zero; set to the ZEC seller by the matcher |
| `claimed` | Terminal state | `false` until `claim` succeeds |
| `refunded` | Terminal state | `false` until `refund` succeeds |

The lock identifier is a monotonic `uint256` counter. Sequential ids make offchain lookups, observer proofs, and replay logs trivial and remove the need for a secondary index.

### Hash function

The hash function is SHA-256 via the EVM precompile at `address(0x02)`. The ZEC P2SH leg uses SHA-256 in its standard script. The same preimage and the same digest are valid on both chains, which is the only way the swap can stay trustless. Keccak-256 is not used on the lock surface even though it is cheaper in EVM gas.

### Public methods

`deposit(LockParams calldata params) external returns (uint256 lockId)` pulls `params.amount` of `params.token` from `msg.sender` using `transferFrom`, stores the lock, and emits `Deposited`. The call reverts if any constraint above fails or if the token transfer returns false.

`claim(uint256 lockId, bytes32 preimage) external` checks `sha256(preimage) == locks[lockId].hashlock`, checks `msg.sender == locks[lockId].claimTo`, checks the lock is not already terminal, transfers the locked amount to `claimTo`, marks the lock claimed, and emits `Claimed(preimage)`.

`refund(uint256 lockId) external` checks `msg.sender == locks[lockId].depositor`, checks `block.timestamp >= locks[lockId].refundAfter`, checks the lock is not already terminal, transfers the locked amount to `refundTo`, marks the lock refunded, and emits `Refunded`.

### Safety rails

The contract is non-upgradeable, has no admin key, no oracle, no callback, no flashloan path, and no proxy surface. It exposes a pause switch that halts new deposits only; in-flight locks always retain a wallet-controlled refund path. The pauser role can pause, the governor role can unpause, and the two are configured at deploy time. There is no way for any role to move a locked balance.

The `MIN_REFUND_DELAY` is a deploy-time constant. The first cut uses one hour. This forces a real safety margin between the EVM claim window and any EVM refund attempt and gives the ZEC leg a strictly later refund deadline, which is required by ADR 0002.

A simple boolean reentrancy guard wraps every state-changing method. The existing pattern in `Settlement.sol` and `Pair.sol` is reused so reviewers do not learn a new idiom.

The contract does not hold a balance of any token other than what is locked. There is no `withdraw`, `sweep`, `rescue`, or admin transfer. There is no fee, no fee recipient, and no revenue path.

### Events

| Event | Trigger | Indexed fields |
| --- | --- | --- |
| `Deposited` | Successful `deposit` | `lockId`, `depositor`, `token`, `claimTo`, `refundTo` |
| `Claimed` | Successful `claim` | `lockId`, `claimTo` |
| `Refunded` | Successful `refund` | `lockId`, `refundTo` |

`hashlock` and `preimage` are not emitted in plain. `hashlock` is part of `Deposited` data, which is fine because it is a public commitment. `preimage` is not emitted at all; the offchain coordinator records it once the ZEC leg claims so observers can verify the EVM claim later.

## Why this design

The lock is the minimum contract surface that satisfies the deterministic safety rules in ADR 0002. One lock per fill keeps the contract state linear, makes the ABI small, and lets the matcher and observers index by lock id without ambiguity. A pull-based deposit, a single-claimant release, and a depositor-only refund cover the three terminal states the workflow can reach.

A `claimTo` field instead of an open claim is what prevents MEV theft of the seller. The seller is the only address that can submit the preimage on the EVM side. A frontrunner can see the preimage in the ZEC mempool but cannot call `claim` against the EVM lock because the EVM leg only pays the seller.

The lock holds the exact approved stablecoin and the exact approved amount. There is no wrapped ZEC, no LP share, no receipt, and no internal ledger, which is the only shape that satisfies the non-custodial rule.

Sequential ids and SHA-256 match the rest of the project. The offchain matcher, the EIP-712 order digest, and the Zcash script builder all use deterministic, integer-only encodings. A more elaborate key derivation or a hash-based id would add cost for no observable benefit at the scale of one lock per fill.

## Alternatives considered

### Open claim with anyone-can-claim preimage

This trades the `claimTo` restriction for a simpler interface. It is rejected because the EVM mempool exposes the preimage the moment the ZEC claim lands, and any MEV bot could submit the EVM claim before the seller does. The seller would lose the stablecoin. The `claimTo` field is the only safe option.

### Per-token contracts

One contract per stablecoin would shrink the deployed surface per token but double the audit surface, double the deployment ceremony, and force the matcher to keep two ABI variants. The single contract with an immutable `usdc` and `usdt0` address matches the existing `Settlement.sol` pattern and is preferred.

### EIP-712 signed authorization

A signed offchain message could authorize a release without a hashlock. This is rejected because the entire point of the atomic swap is that neither side can take the other's funds without the preimage. A signature-based release would be a custody contract in disguise.

### Upgradeable proxy

A proxy would let the team patch bugs after deployment. This is rejected for the same reason as ADR 0002: the EVM side of a non-custodial swap must be a constant. Any change to the lock surface is a new contract, a new audit, and a new deploy.

## Consequences

The contract is the EVM anchor for the atomic-swap workflow. The ZEC P2SH builder, the matcher, the coordinator, the observers, and the UI all bind to its ABI.

The contract cannot act on Zcash. It can hold stablecoins, release them against a preimage, and return them after a deadline. Everything else is the responsibility of the offchain services and the wallet adapter.

A second contract family, the Zcash script builder, is still required. This ADR only fixes the EVM half. The ZEC half is the subject of a later ADR and a separate PR.

The contract is not deployed. The existing `infra/testnet/arbitrum-sepolia.json` manifest stays at `"deployed": false`. The first deploy target is a local Anvil instance or a public testnet that the operators have not yet selected.

## Required guardrails

* The lock is the only state. No proxy, no admin transfer, no fee path.
* Every lock has a `refundAfter` strictly greater than `block.timestamp + MIN_REFUND_DELAY` at deposit.
* The EVM `refundAfter` must be strictly earlier than the ZEC `refundAfter`. The matcher enforces this offchain; the contract trusts whatever value the depositor submits.
* The `preimage` is never emitted. Observers reconstruct it from the ZEC claim.
* The matcher and the observers never hold a wallet key, never call `claim` or `refund` on a user's behalf, and never see the preimage before the user reveals it on Zcash.
* Local Foundry tests run on every push. The CI run includes `forge test --root contracts`.

## Mainnet gate

This ADR advances to a production decision only after:

* the ZEC P2SH builder and its tests are complete;
* the ZEC `refundAfter` construction is reviewed and tested against a current wallet;
* the stablecoin identities are verified from the current issuer registry;
* an independent review of the contract and the deposit, claim, and refund paths;
* deterministic, fuzz, and adversarial timeout tests on a local chain;
* executed wallet tests for the exact preimage reveal and refund paths;
* a final-byte review of the deployed bytecode and the constructor arguments;
* legal and compliance approval for the named operator and jurisdictions;
* explicit approval for any testnet or mainnet deploy.

Until then, `ConditionalLock` is a local-foundry contract. It must not be deployed to a public chain.

## Revisit conditions

Revisit this decision if any of the following occurs:

* the ZEC P2SH path changes in a way that makes SHA-256 the wrong choice;
* an audited cross-chain settlement primitive that does not need a hashlock becomes available;
* the approved stablecoin identity, decimals, or behaviour changes;
* MEV mitigation requires a different claimant model;
* a wallet or chain constraint forces the contract surface to grow.
