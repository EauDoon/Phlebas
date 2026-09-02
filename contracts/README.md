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
| `ConditionalLock` | EVM half of one native ZEC atomic-swap fill. One immutable exact-token amount, SHA-256 claim, original-funder refund, three ordered deadlines, no admin, and no fee. See [ADR 0003](../docs/adr/0003-evm-conditional-lock.md). |

Core contracts are non-upgradeable. There is no seizure path, arbitrary pair creation, flash callback, or fee switch.

```bash
forge test --root contracts -vv
```

## Retired Arbitrum Sepolia artifacts

The older Arbitrum Sepolia contracts and manifest remain only as historical local-test records. There is no supported broadcast, wallet-submission, manifest-promotion, CI, or Vercel activation path for them. Do not use them as Ethereum Mainnet configuration.

## ConditionalLock local verification

The exact-token lock is independent of the undeployed tZEC CLOB stack. This tree contains no `ConditionalLock` deployment or broadcast script. It does not select a chain, token address, wallet, or constructor packet.

Build and test without network access:

```bash
npm ci --ignore-scripts
forge fmt --root contracts --check
forge build src/swap/ConditionalLock.sol --root contracts --offline --force --sizes
forge test --root contracts --offline -vvv
forge test --root contracts --offline --match-contract ConditionalLock --gas-report
node scripts/validate-conditional-lock-manifest.mjs contracts/manifests/conditional-lock.not-deployed.json
node --test scripts/validate-conditional-lock-manifest.test.mjs
```

The checked-in deployment record remains false and disables network action. Null values mean no chain, address, transaction, constructor packet, or deployed bytecode has been recorded. See [the source and bytecode procedure](../docs/EVM_CONDITIONAL_LOCK_VERIFICATION.md) before treating any future deployment as this reviewed contract.

## Zcash lab

The canonical key-independent Zcash transaction lab lives in `src/lib/zcash-htlc.ts`, `src/lib/zcash-funding.ts`, `src/lib/zcash-spend.ts`, `src/lib/zcash-artifact.ts`, and `src/lib/zcash-pczt.ts`. It uses an exact SHA-256 digest and produces committed unsigned effecting-data manifests. It does not construct complete canonical transactions, sign, extract, or broadcast. The older `/zcash` surface and HASH160 helpers are legacy display-only components.

| File | Role |
| --- | --- |
| `src/lib/ripemd160.ts` | Thin Node-native `ripemd160` wrapper. |
| `src/lib/sha256d.ts` | Double SHA-256 for Base58Check. |
| `src/lib/base58check.ts` | Base58Check encoder and decoder. |
| `src/lib/zcash-script.ts` | Zcash op-code table, push encoders, concat helper. |
| `src/lib/zcash-pubkey.ts` | Compressed secp256k1 pubkey parser and encoder. |
| `src/lib/zcash-atomic-swap.ts` | Claim branch, refund branch, full atomic-swap script, round-trip parser. |
| `src/lib/zcash-address.ts` | Transparent address encoder and decoder plus the existing `inspectTransparentDestination` classifier. |
| `src/lib/zcash-wallet-adapter.ts` | Legacy synthetic display shapes only. Not canonical Zcash transactions or a signing adapter. |
| `src/app/zcash/page.tsx` | Read-only legacy display route. Shows explicitly labeled incomplete synthetic shapes, not transactions. |


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
  process: `types.ts`, `config.ts`, `health.ts`, `poller.ts`,
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
- PHLEBAS_OBSERVER_REORG_DEPTH: reorganization depth in BLOCKS, for
  the paths that really are counting blocks.
- PHLEBAS_OBSERVER_REORG_WINDOW_SECONDS: how long after a terminal
  observation the watchtower still warns that a reorganization could
  undo it, in SECONDS. Separate from the depth on purpose: converting
  between the two needs a per-chain block interval, and the observer
  watches two chains that do not share one.
- PHLEBAS_OBSERVER_DEADLINE_BUFFER — watchtower deadline threshold.
- PHLEBAS_OBSERVER_POLL_INTERVAL_SECONDS — poll cadence. Required,
  with no default.
- PHLEBAS_OUTPOINT_FILL_MAP — comma-separated `txid:vout=fillId`
  pairs for ZEC event reduction.

## Public market data (PR 5)

The public market data surface is four read-only HTTP endpoints
on the matcher service. The surface is the public read-only view
of the matcher operator's in-memory state.

### Files

- src/lib/market-data.ts (additions at the end of the file) —
  `tickerFromOperator`, `tradesFromReceipts`, `depthFromBook`,
  `marketsFromOperator`, and `topFills`. The pure functions take the
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
