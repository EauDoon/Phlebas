# Phlebas testnet contracts

No-value Arbitrum Sepolia sources. They are not deployed from this tree, not audited, and not mainnet configuration.

| Contract | Role |
| --- | --- |
| `PZec` | 8-decimal `tpZEC`. Minter mints. Holder burns. Pauser can halt minting; only governor unpauses. |
| `QuoteToken` | 6-decimal `tUSDC` / `tUSDT0` faucets. Not Circle USDC or USDT0. |
| `Settlement` | EIP-712 CLOB fills, nonce bitmap, account epoch, buyer-up / seller-down quote rounding. |
| `Factory` | Creates only `pZEC/tUSDC` and `pZEC/tUSDT0`. |
| `Pair` | Fixed 30 bps constant product. No callbacks. |
| `Router` | Stateless add/remove/swap. Reverts if it retains tokens. |

Core contracts are non-upgradeable. There is no seizure path, arbitrary pair creation, flash callback, or fee switch.

```bash
forge test -vv
```

Deploy only with an approved Sepolia key outside this repository:

```bash
forge script script/DeployTestnet.s.sol:DeployTestnet --rpc-url $ARBITRUM_SEPOLIA_RPC --broadcast
```

Record the commit and addresses in `infra/testnet/arbitrum-sepolia.json`. Leave `deployed` false until that write happens.
