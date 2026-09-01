# ADR 0002: Native ZEC, native USDC, native USDT

Date: 01-09-2026
Status: Superseded simulation-label record
Production status: Not approved
Supersedes: ADR 0001 pair mapping (`pZEC/USDC` and `pZEC/USDT0`)
Superseded by: [Native ZEC Atomic Settlement](0002-native-zec-atomic-settlement.md)

## Context

ADR 0001 selected Arbitrum One and a custody-backed `pZEC` ERC-20 so the order book and Uniswap v2 style pools could share one settlement domain. Its candidate pair mapping used `pZEC/USDC` and `pZEC/USDT0`, and it treated USDT0 as the quote for the displayed `ZEC/USDT` market.

The product now presents two native market labels. USDT0 is abandoned as a listed quote. The public app remains a no-value simulation. This record does not define settlement architecture; the wallet-controlled per-fill atomic-swap ADR does.

## Decision

The canonical market and settlement names are:

| Display market | Settlement pair | Quote |
| --- | --- | --- |
| `ZEC/USDC` | `ZEC-USDC` | native USDC |
| `ZEC/USDT` | `ZEC-USDT` | native USDT |

Those labels are native ZEC against native USDC or native USDT. The later-listing-gate copy is removed. USDT0 is not a listed settlement asset.

This ADR does not authorize live funds, a payable gateway, shielded ZEC, or live native-ZEC execution. Session encoding names `baseAsset` `ZEC`. Undeployed contract sources use `tZEC` as the 8-decimal receipt symbol and `tUSDT` as the quote faucet. The Solidity type is `Zec`. Product copy must not present those names as live settlement.

The undeployed `tZEC` receipt and Arbitrum pool described by the earlier simulation are legacy fixtures. They are not the current listed form or the native-settlement target. The interface must keep saying that the preview moves no live funds.

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
