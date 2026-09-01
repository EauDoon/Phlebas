# ADR 0001: Arbitrum One and pZEC

Date: 30-08-2026
Status: Superseded by [ADR 0002](0002-native-zec-atomic-settlement.md) for the target product
Production status: Not approved
Pair mapping: superseded by [ADR 0002](0002-native-zec-usdc-usdt.md). Arbitrum One and custody-backed `pZEC` as the ERC-20 form remain.

This ADR remains the record of the custody-backed simulation design. New product work must follow ADR 0002.

## Context

Phlebas is a simulation for `ZEC/USDC` and `ZEC/USDT` markets with a central limit order book and Uniswap v2 style liquidity pools.

The current repository has no deployed contracts, chain clients, reserve wallet, operational custody, bridge, signer, or real customer balances. This decision sets a design baseline. It does not authorize deployment or custody.

Native ZEC uses the Zcash UTXO model. USDC and the candidate USDT0 integration use ERC-20 contracts on EVM chains. A Uniswap v2 style pool needs two ERC-20 reserves in one contract and issues ERC-20 LP shares, according to the [Uniswap protocol description](https://developers.uniswap.org/docs/get-started/concepts/how-uniswap-works).

Transparent ZEC can support bilateral hash time-locked swaps. [ZIP 300](https://zips.z.cash/zip-0300) defines a Proposed transparent P2SH atomic-swap protocol, but it does not create a common contract state for passive LP reserves and LP shares.

## Decision

Phlebas will use Arbitrum One as the candidate settlement chain for simulation labels, contract design, and future test planning.

Phlebas will use `pZEC` as the candidate base settlement asset. `pZEC` means Phlebas ZEC and would be an 8-decimal ERC-20 claim backed one for one by transparent native ZEC held in approved custody.

`pZEC` is custody-backed. It is not native ZEC, shielded ZEC, or a trustless representation. No `pZEC` contract exists today.

The candidate pair mapping is:

| Display market | Candidate settlement pair |
| --- | --- |
| `ZEC/USDC` | `pZEC/USDC` |
| `ZEC/USDT` | `pZEC/USDT0` |

Arbitrum's official documentation supports Solidity contracts and ERC-20 transfers. The [USDT0 deployment registry](https://docs.usdt0.to/technical-documentation/deployments) identifies Arbitrum One as chain ID `42161`. Circle lists native Arbitrum USDC in its [official contract registry](https://developers.circle.com/stablecoins/usdc-contract-addresses).

No chain ID, token address, proxy, OFT address, admin identity, or bytecode hash is approved for production configuration by this ADR. Those values must be reverified from current primary sources during the mainnet gate.

## Why this design

One EVM settlement domain lets the order book and both constant-product pools use the same asset balances and atomic contract execution. `pZEC` provides the ERC-20 form needed by those contracts.

Arbitrum One supplies a concrete EVM baseline and current candidate deployments for both quote paths. Selecting one chain avoids writing a chain-agnostic design that cannot define signatures, finality rules, token identities, or incident controls.

The choice does not make the native ZEC bridge decentralized. The custody operator remains responsible for reserve solvency and redemption.

## Alternatives considered

### Native cross-chain atomic swaps

Atomic swaps avoid a standing wrapped-ZEC custodian for each bilateral trade. They require two-chain monitoring, staggered timeouts, refunds, and liveness from both parties or solvers. Each partial fill becomes a separate settlement workflow.

This option is not the core design because atomic swaps alone cannot supply a single-state Uniswap v2 pool. It remains eligible for a later native-settlement lane after an audited implementation and adversarial timeout testing.

### Internal custodial balances without pZEC

An internal ledger could support a hosted order book, but it would not supply an ERC-20 asset to onchain LP contracts. It would also make all trading balances directly custodial. This option is not selected for the target market structure.

### Another EVM chain

Other EVM chains can support ERC-20 order settlement and constant-product pools. They remain possible if later evidence shows a better fit. Arbitrum One is the design baseline, not an irreversible production commitment.

### Ethereum mainnet

Ethereum mainnet could support the same contract model. It is not the current baseline because the project needs one testable target and the selected quote assets already have documented Arbitrum paths. No claim about comparative cost or security is made by this ADR.

## Consequences

The candidate design can express both CLOB settlement and v2 style LP positions on one chain.

The design introduces these dependencies:

* transparent native ZEC custody and signer security;
* correct one-for-one `pZEC` mint, burn, and reserve accounting;
* Arbitrum finality, availability, and contract execution;
* stablecoin issuer and contract controls;
* bridge, settlement, and pool contract security;
* honest disclosure that the base asset is custody-backed.

Vercel remains limited to the web interface and stateless public routes. Zcash nodes, ledgers, mint controllers, signers, and custody keys stay outside Vercel on private persistent infrastructure.

[Zallet](https://zcash.github.io/zallet/) is beta, has not been fully reviewed, and may make breaking changes. It may support tests, but it is not accepted as the production custody dependency under this decision.

## Required guardrails

* The application says "Simulation" anywhere a user could mistake sample values for live data.
* `pZEC` is always described as custody-backed.
* Zcash ingress and egress are transparent only.
* Every deposit intent receives one fresh, single-use ZIP 320 TEX address that is never reassigned.
* External ZEC deposits wait for at least 10 confirmations in development and testnet. [Draft ZIP 315](https://zips.z.cash/zip-0315) is the source for that minimum. The restricted-mainnet canary design starts at 100 confirmations and at least two hours, whichever is later.
* Zero-confirmation ZEC never creates spendable credit. [ZIP 203](https://zips.z.cash/zip-0203) explicitly rejects reliance on zero-confirmation transactions.
* Minting and withdrawals halt on node disagreement, chain reorganization, signer failure, or reserve mismatch.
* `pZEC` supply and all pending customer liabilities remain fully matched by confirmed reserve assets and accounted withdrawal-in-transit value.
* Mainnet contract and custody actions require separate explicit authorization.

## Mainnet gate

This ADR can advance to a production decision only after:

* legal and regulatory approval for the named operator and jurisdictions;
* audited `pZEC`, order-settlement, router, and pool contracts;
* an approved custody signer with tested backup and recovery;
* Zebra redundancy and tested Zcash reorganization handling;
* exact Arbitrum chain and token identity verification;
* double-entry reserve accounting and independent reconciliation;
* test-environment evidence for deposit, mint, trade, burn, withdrawal, expiry, and reorganization flows;
* public custody, redemption, privacy, and admin-power disclosures;
* explicit approval to deploy and accept real assets.

Until then, Arbitrum and `pZEC` are simulation and design choices only.

## Revisit conditions

Revisit this decision if any of the following occurs:

* Zcash gains an audited trust-minimized bridge that supports the required market structures;
* an audited native-settlement design can provide equivalent LP behavior without custody;
* Arbitrum no longer supports the required quote assets or operational controls;
* legal analysis makes custody-backed `pZEC` unavailable in the intended jurisdictions;
* Zcash network upgrades change transparent transaction, confirmation, fee, or signer assumptions;
* testing shows that the bridge or settlement risks cannot be reduced to the approved threshold.
