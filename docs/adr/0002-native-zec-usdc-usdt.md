# ADR 0002: Native ZEC, native USDC, native USDT

Date: 31-08-2026
Status: Accepted for simulation labels only
Production status: Not approved
Supersedes: ADR 0001 pair mapping (`pZEC/USDC` and `pZEC/USDT0`)

## Context

ADR 0001 selected Arbitrum One and a custody-backed `pZEC` ERC-20 so the order book and Uniswap v2 style pools could share one settlement domain. Its candidate pair mapping used `pZEC/USDC` and `pZEC/USDT0`, and it treated USDT0 as the quote for the displayed `ZEC/USDT` market.

The product now presents two native settlement pairs. USDT0 is abandoned as a listed quote. The public app remains a no-value simulation.

## Decision

The canonical market and settlement names are:

| Display market | Settlement pair | Quote |
| --- | --- | --- |
| `ZEC/USDC` | `ZEC-USDC` | native USDC |
| `ZEC/USDT` | `ZEC-USDT` | native USDT |

Those labels are native ZEC against native USDC or native USDT. The later-listing-gate copy is removed. USDT0 is not a listed settlement asset.

This ADR does not authorize live funds, a payable gateway, shielded ZEC, or live native-ZEC execution. Session encoding names `baseAsset` `ZEC`. Undeployed contract sources use `tZEC` as the 8-decimal receipt symbol and `tUSDT` as the quote faucet. The Solidity type remains `PZec`. Product copy must not present those names as live settlement.

Arbitrum One remains the candidate settlement chain from ADR 0001. Custody-backed `pZEC` remains the candidate ERC-20 claim for a future gateway. The interface must keep saying the matcher is not trustless and that this preview moves no live funds.

## Why this design

The requested markets are native ZEC against native USDC and native USDT. Keeping USDT0 as a listed quote would describe a lock-and-mint representation the product no longer intends to list.

The simulation can label those native pairs without operating a Zcash node, minting a receipt, or listing issuer-native mainnet tokens.

## Alternatives considered

### Keep `pZEC/USDT0` as the settlement label

Honest about the ERC-20 form and the abandoned USDT0 path. Rejected because the product now names native ZEC, USDC, and USDT, and because USDT0 is not a listed quote.

### Claim live native-ZEC execution

Rejected. No gateway, reserve, or settlement contract is operating. Native labels are simulation names.

## Consequences

Ticket, blotter, LP, chart, depth, wallet, and landing copy name `ZEC-USDC` or `ZEC-USDT`.

USDT0 appears only as an abandoned-asset disclosure.

Mainnet still needs issuer-native USDC and USDT address revalidation, Tether and Circle terms, and the existing custody, legal, and country gates. This ADR does not pass those gates.
