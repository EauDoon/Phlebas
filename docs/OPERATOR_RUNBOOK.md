# Local operator runbook

Status: isolated loopback Compose only. No live funds. No mainnet TEX. Vercel is not an operator host.

Do not set `PHLEBAS_GATEWAY_URL` or `PHLEBAS_MATCHER_URL` on Vercel.

## What this runs

| Process | Host bind | Health | Role |
| --- | --- | --- | --- |
| gateway | `127.0.0.1:8787` | `GET /health` | Issue one `textest` address per intent |
| matcher | `127.0.0.1:8788` | `GET /health` | Persistent native-order and solver domain, no-value only |
| observer | `127.0.0.1:8789` | `GET /health` | Textest mint-attestation stub, no Zebra RPC |

Compose publishes those ports on loopback only. Inside the container `PHLEBAS_BIND=0.0.0.0`; the host mapping remains `127.0.0.1`.

## Start

From the repository root:

```bash
docker compose -f services/compose.yaml up --build
```

Without Docker:

```bash
npm run gateway
npm run matcher
npm run observer
```

Each process defaults to `127.0.0.1`. Direct `npm run` processes refuse `PHLEBAS_BIND=0.0.0.0` unless `PHLEBAS_ALLOW_NON_LOOPBACK=1` (Compose sets that inside the container only).

## Health

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8788/health
curl http://127.0.0.1:8789/health
```

Expect `network: testnet` from the legacy gateway and observer. Gateway health includes `issued` and `cap`. A direct matcher start reports `matcher: persistent-native-v1`, `configured: false`, `acceptingMutations: false`, `mode: no-value`, and `custody: false`. An embedding operator can inject an immutable configuration and verifier for local validation. A configured matcher also reports its sequence, state root, configuration hash, and exact checkpoint.

## Gateway: issue a testnet TEX

```bash
curl -X POST http://127.0.0.1:8787/intents
```

The body is a single-use `textest` address and a ZIP 321 URI. Never reuse the address. Never treat this as a mainnet deposit. The process refuses further issues after 64 intents (`PHLEBAS_GATEWAY_MAX_INTENTS`).

Local Next.js only:

```bash
set PHLEBAS_GATEWAY_URL=http://127.0.0.1:8787
```

## Matcher: persistent v1 domain

The public app does not call this service by default. `npm run matcher` is intentionally unconfigured, so health remains available while every mutation and feed returns `matcher-configuration-unavailable`. The test and embedding interface may supply one immutable configuration and signature verifier. Configuration does not add a signing, transaction, broadcast, or custody capability.

A configured service exposes:

| Method and route | Purpose |
| --- | --- |
| `POST /v1/orders` | Accept one signed order intent |
| `POST /v1/order-cancellations` | Apply one signed order cancellation |
| `POST /v1/account-epochs` | Apply one signed account-epoch advance |
| `POST /v1/solver-quotes` | Accept one signed wallet-held solver quote |
| `POST /v1/solver-quote-cancellations` | Cancel one signed solver quote |
| `GET /v1/checkpoint` | Return the current journal, configuration, and state commitment |
| `GET /v1/sequence?after=N&limit=L` | Return receipts after an exclusive cursor |
| `GET /v1/market/book?limit=L` | Return bounded aggregated active levels |
| `GET /v1/solver-quotes?limit=L` | Return bounded active solver quotes |
| `GET /v1/executions?after=N&limit=L` | Return fills and blocked no-value swap plans |
| `GET /v1/requests/{requestId}` | Resolve an idempotency receipt |

Every mutation requires JSON, an `Idempotency-Key` header equal to the payload `requestId`, and the exact event kind for the route. The service rejects unknown, missing, duplicate, prototype-sensitive, oversized, excessive-depth, and excessive-node input. Default limits are 64 KiB per body, 64 admitted mutations, 120 mutations per remote address per minute, and 100 feed records per page.

See [ADR 0003](adr/0003-persistent-native-matcher.md) for exact semantics and unresolved production gates.

Local Next.js only:

```bash
set PHLEBAS_MATCHER_URL=http://127.0.0.1:8788
```

## Observer: attest a textest outpoint

`POST /attest` requires a `textest` destination, a fully transparent final transaction, and 10 confirmations. One `(txid, vout)` authorizes at most one mint candidate. Observer disagreement returns an error and does not mint.

This stub does not open Zebra RPC and does not call `PZec.mint`.

`POST /coverage` accepts a reserve snapshot and returns `calculateReserveCoverage`. It reproduces the operator's arithmetic from public inputs. It is not a live reserve monitor. `POST /attest` with `reserve` fails closed when `controlledCovered` is false.

## Stop

```bash
docker compose -f services/compose.yaml down
```

Direct processes: interrupt the three Node jobs. Data directories under `services/*/.data` remain local.

## Data

Gateway master key: `services/gateway/.data/master.key`. Gateway replay state: `services/gateway/.data/state.json`. Configured matcher state uses `services/matcher/.data/native-v1/events.jsonl`, `checkpoint.json`, `initialized`, and `writer.lock`. Observer persist is `services/observer/.data/state.json`. Those paths are gitignored.

Matcher events are appended and fsynced before state publication. Checkpoints and initialization markers use atomic replacement. Windows does not provide a portable directory-fsync barrier, so the implementation skips only that unsupported final barrier after file fsync and rename. Windows also ignores POSIX mode bits. Do not copy these directories into git or onto Vercel.

One persistence directory allows one writer. Normal `SIGINT` and `SIGTERM` handling closes the store and removes its lock. If a lock remains, stop every candidate writer, identify the prior process, preserve the full directory, and validate the journal and checkpoint before recording an operator decision to remove a proven stale lock. Never delete initialized persistence or reset the sequence as recovery.

## Incidents

| Signal | Action |
| --- | --- |
| Health fails on loopback | Restart that process. Do not point Vercel at it. |
| Observer disagreement | Stop new attestations. Inspect the payload. Do not mint. |
| Shielded or mixed final tx | Quarantine. Do not mint. |
| Reorg drops an observation | Observer drops off-chain and under-confirmed outpoints. Do not mint. |
| Persist file missing or unreadable after initialization | Service fails closed. Restore a verified snapshot or rebuild under the incident procedure. Never reset sequence or mint history silently. |
| Matcher writer lock exists | Treat it as another writer or unproven stale lock. Do not start a second writer or delete the lock until the recovery checks above pass. |
| Matcher checkpoint differs from replay | Stop mutation intake, preserve every byte, and investigate. Replay never trusts a mismatched checkpoint. |
| Port bound on `0.0.0.0` on the host | Stop. Host publish must be `127.0.0.1`. |
| Temptation to set gateway/matcher URLs on Vercel | Do not. Vercel stays the public UI only. |

## Out of scope here

- Arbitrum Sepolia `--broadcast`
- `--mark-deployed`
- Mainnet TEX
- Live funds
- Hosted production matcher or custody
