# Phlebas testnet contracts

No-value Arbitrum Sepolia sources. They are not deployed from this tree, not audited, and not mainnet configuration.

| Contract | Role |
| --- | --- |
| `PZec` | 8-decimal `tpZEC`. Minter mints. Holder burns. Pauser can halt minting; only governor unpauses. |
| `QuoteToken` | 6-decimal `tUSDC` / `tUSDT0` faucets. Not Circle USDC or USDT0. |
| `Settlement` | EIP-712 CLOB fills, signed time-in-force, nonce bitmap, account epoch, and conservative quote rounding. |
| `Factory` | Creates only `pZEC/tUSDC` and `pZEC/tUSDT0`. |
| `Pair` | Fixed 30 bps constant product with locked minimum liquidity. No callbacks. |
| `Router` | Stateless add/remove/swap with liquidity slippage bounds. Reverts if it retains tokens. |

Core contracts are non-upgradeable. There is no seizure path, arbitrary pair creation, flash callback, or fee switch.

```bash
forge test --root contracts -vv
```

## Arbitrum Sepolia deploy

Need Foundry, an Arbitrum Sepolia RPC, and approved, distinct deployer, minter, pauser, governor, and fee-recipient addresses. The private key stays outside git.

```bash
export PHLEBAS_DEPLOYER=...
export PHLEBAS_MINTER=...
export PHLEBAS_PAUSER=...
export PHLEBAS_GOVERNOR=...
export PHLEBAS_FEE_RECIPIENT=...
```

Dry run, no state change:

```bash
forge script script/DeployTestnet.s.sol:DeployTestnet --root contracts --rpc-url $ARBITRUM_SEPOLIA_RPC
```

Broadcast (creates a real Sepolia tx):

```bash
forge script script/DeployTestnet.s.sol:DeployTestnet --root contracts --rpc-url $ARBITRUM_SEPOLIA_RPC --broadcast --private-key $PHLEBAS_DEPLOYER_KEY
```

Foundry writes `contracts/broadcast/DeployTestnet.s.sol/421614/run-latest.json`. That file is gitignored.

Copy addresses into the canonical manifest without claiming deployment:

```bash
node scripts/record-sepolia-deploy.mjs
```

`infra/testnet/arbitrum-sepolia.json` stays `"deployed": false` until a real transaction hash is in the broadcast **and** you pass `--mark-deployed` after checking the explorer:

```bash
node scripts/record-sepolia-deploy.mjs --mark-deployed
```

Do not run `--mark-deployed` from CI or Vercel. Do not point this script at mainnet.
