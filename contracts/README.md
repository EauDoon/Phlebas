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
| `ConditionalLock` | EVM half of a native-ZEC atomic swap. One stablecoin deposit per lock, SHA-256 preimage release, depositor-only refund after a chain-local deadline. Non-upgradeable, no admin transfer, no fee. See [ADR 0003](../docs/adr/0003-evm-conditional-lock.md). |

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

## ConditionalLock local deploy

The EVM half of the native-ZEC atomic swap is independent of the pZEC deploy. It needs only the two approved stablecoin addresses, a pauser, and a governor. The constructor reverts if any role is zero, if the two stablecoins are equal, or if either stablecoin address has no deployed code.

```bash
export PHLEBAS_USDC=...
export PHLEBAS_USDT0=...
export PHLEBAS_PAUSER=...
export PHLEBAS_GOVERNOR=...
```

Dry run, no state change:

```bash
forge script script/DeployConditionalLock.s.sol:DeployConditionalLock --root contracts --rpc-url $ARBITRUM_SEPOLIA_RPC
```

Broadcast (creates a real Sepolia tx):

```bash
forge script script/DeployConditionalLock.s.sol:DeployConditionalLock --root contracts --rpc-url $ARBITRUM_SEPOLIA_RPC --broadcast --private-key $PHLEBAS_DEPLOYER_KEY
```

The contract has no custody, fee, or admin-transfer path. The constructor is non-upgradeable. Pause halts new deposits only; every in-flight lock retains a wallet-controlled refund path.

