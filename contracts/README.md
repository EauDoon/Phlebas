# Phlebas testnet contracts

No-value Arbitrum Sepolia sources. They are not deployed from this tree, not audited, and not mainnet configuration.

| Contract | Role |
| --- | --- |
| `Zec` | 8-decimal `tZEC`. Minter mints. Holder burns. Pauser can halt minting; only governor unpauses. Not native ZEC. |
| `QuoteToken` | 6-decimal `tUSDC` / `tUSDT` faucets. Not Circle USDC or Tether USDT. |
| `Settlement` | EIP-712 CLOB fills, signed time-in-force, nonce bitmap, account epoch, buyer-up / seller-down quote rounding. |
| `Factory` | Creates only `tZEC/tUSDC` and `tZEC/tUSDT`. |
| `Pair` | Fixed 30 bps constant product with locked minimum liquidity. LP symbol `tLP`. No callbacks. |
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

The EVM half of the native-ZEC atomic swap is independent of the tZEC CLOB deploy. It needs only the two approved stablecoin addresses, a pauser, and a governor. The constructor reverts if any role is zero, if the two stablecoins are equal, or if either stablecoin address has no deployed code.

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

## Zcash lab

The ZEC half of the atomic swap lives in `src/lib/zcash-*` and `src/app/zcash/`. The address encoder, the P2SH script builder, and the wallet adapter are all key-independent. No signing or broadcast happens in the Zcash surface in this PR. The hash function is `ripemd160`, which Node 24 exposes natively; the browser path is a follow-up because Web Crypto does not expose `ripemd160`.

| File | Role |
| --- | --- |
| `src/lib/ripemd160.ts` | Thin Node-native `ripemd160` wrapper. |
| `src/lib/sha256d.ts` | Double SHA-256 for Base58Check. |
| `src/lib/base58check.ts` | Base58Check encoder and decoder. |
| `src/lib/zcash-script.ts` | Zcash op-code table, push encoders, concat helper. |
| `src/lib/zcash-pubkey.ts` | Compressed secp256k1 pubkey parser and encoder. |
| `src/lib/zcash-atomic-swap.ts` | Claim branch, refund branch, full atomic-swap script, round-trip parser. |
| `src/lib/zcash-address.ts` | Transparent address encoder and decoder plus the existing `inspectTransparentDestination` classifier. |
| `src/lib/zcash-wallet-adapter.ts` | `buildFundTransaction`, `buildClaimTransaction`, `buildRefundTransaction`, `hashAtomicSwapParams`. |
| `src/app/zcash/page.tsx` | Server route at `/zcash`. Read-only. Derives the script, address, and unsigned transactions from URL params. |


## Atomic-swap observer service (PR 4)

The atomic-swap observer service consumes EVM and ZEC events,
applies transitions to a persistent coordinator, and exposes the
watchtower's alerts over HTTP. The service is the second half of
the read-only surface that PR 1 (EVM lock) and PR 3 (ZEC leg) leave
open.

### Files

- src/lib/evm-observer.ts, src/lib/zcash-observer.ts — pure
  per-event pollers.
- src/lib/evm-event-reducer.ts, src/lib/zcash-event-reducer.ts,
  src/lib/transition-mapper.ts — turn event records into
  coordinator transitions.
- src/lib/atomic-coordinator.ts — applies transitions, tracks the
  cursor, records rejected transitions.
- src/lib/coordinator-snapshot.ts,
  src/lib/coordinator-persistence.ts — JSON-on-disk snapshot with
  atomic write and bootstrap-time marker.
- src/lib/watchtower.ts — emits reorg-depth-exceeded,
  missing-terminal-event, and deadline-breach alerts.
- services/atomic-swap-observer/ — wires the above into one HTTP
  process: 	ypes.ts, config.ts, health.ts, poller.ts,
  server.ts.

### Endpoints

- GET /health — readiness probe, returns 503 if the snapshot is
  missing after init.
- GET /state — fill count, cursor, alert count, bootstrap state.
- GET /fills — list of all fills with their state.
- GET /fills/:fillId — per-fill detail.
- GET /alerts — current watchtower alerts.
- POST /observe — trigger a one-shot poll (operator-only).

### Configuration

- PHLEBAS_CONDITIONAL_LOCK_ADDRESS — EVM contract address.
- PHLEBAS_OBSERVER_SNAPSHOT_PATH — JSON snapshot path.
- PHLEBAS_ZCASH_WATCH_ADDRESSES — comma-separated P2SH addresses.
- PHLEBAS_OBSERVER_FROM_BLOCK, PHLEBAS_OBSERVER_FROM_HEIGHT —
  poll start.
- PHLEBAS_OBSERVER_REORG_DEPTH,
  PHLEBAS_OBSERVER_DEADLINE_BUFFER — watchtower thresholds.
- PHLEBAS_OBSERVER_POLL_INTERVAL_SECONDS — poll cadence.
- PHLEBAS_OUTPOINT_FILL_MAP — comma-separated 	xid:vout=fillId
  pairs for ZEC event reduction.

## Public market data (PR 5)

The public market data surface is four read-only HTTP endpoints
on the matcher service. The surface is the public read-only view
of the matcher operator's in-memory state.

### Files

- src/lib/market-data.ts (additions at the end of the file) —
  	ickerFromOperator, 	radesFromReceipts, depthFromBook,
  marketsFromOperator, 	opFills. The pure functions take the
  operator state and a clock and return a typed snapshot.
- src/lib/market-data.test.ts — covers the pure functions.
- services/matcher/market-data.test.ts — covers the HTTP
  endpoints on the matcher service.
- services/matcher/server.ts — adds /ticker, /trades,
  /depth, /markets alongside the existing /health,
  /sequence, /book, /orders.

### Endpoints

- GET /ticker — 24-hour ticker: best bid, best ask, mid,
  spread, last price, 24h high, 24h low, 24h volume (base and
  quote), trade count, sequence.
- GET /trades?limit=N — most recent N fills. Default 50,
  maximum 1000.
- GET /depth?levels=N — top N aggregated price levels for
  bids and asks. Default 20, maximum 200.
- GET /markets — configured base asset, supported quote
  assets, current lastTicks, sequence.
- GET /snapshot?depth=N&trades=M — combined snapshot of
  ticker, depth, and trades. Default depth 20, max 200.
  Default trades 50, max 1000.
- GET /version — service and version.
