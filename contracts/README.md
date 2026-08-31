# Phlebas testnet contracts

No-value Arbitrum Sepolia sources. They are not deployed from this tree, not audited, and not mainnet configuration.

| Contract | Role |
| --- | --- |
| `PZec` | 8-decimal `tpZEC`. Minter mints. Holder burns. Pauser can halt minting; only governor unpauses. |
| `QuoteToken` | 6-decimal `tUSDC` / `tUSDT` faucets. Not Circle USDC or Tether USDT. |
| `Settlement` | EIP-712 CLOB fills, nonce bitmap, account epoch, buyer-up / seller-down quote rounding. |
| `Factory` | Creates only `pZEC/tUSDC` and `pZEC/tUSDT`. |
| `Pair` | Fixed 30 bps constant product. No callbacks. |
| `Router` | Stateless add/remove/swap. Reverts if it retains tokens. |

Core contracts are non-upgradeable. There is no seizure path, arbitrary pair creation, flash callback, or fee switch.

```bash
forge test --root contracts -vv
```

## Arbitrum Sepolia deploy

Need Foundry, an Arbitrum Sepolia RPC, and `PHLEBAS_DEPLOYER` (the address that signs). The private key stays outside git.

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
