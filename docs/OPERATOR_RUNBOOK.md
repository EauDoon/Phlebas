# Local operator runbook

Status: isolated loopback Compose only. No live funds. No mainnet TEX. Vercel is not an operator host.

Do not set `PHLEBAS_GATEWAY_URL` or `PHLEBAS_MATCHER_URL` on Vercel.

## What this runs

| Process | Host bind | Health | Role |
| --- | --- | --- | --- |
| gateway | `127.0.0.1:8787` | `GET /health` | Issue one `textest` address per intent |
| matcher | `127.0.0.1:8788` | `GET /health` | Sequence signed orders, persist book |
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

Expect `network: testnet` from gateway and observer. Gateway health includes `issued` and `cap`. Matcher reports `matcher: local-operator`, a keccak `sequenceRoot` over sequence plus receipt digests, `persistReadable`, and `startedAt` / `lastSequenceAt` for downtime polling.

## Gateway: issue a testnet TEX

```bash
curl -X POST http://127.0.0.1:8787/intents
```

The body is a single-use `textest` address and a ZIP 321 URI. Never reuse the address. Never treat this as a mainnet deposit. The process refuses further issues after 64 intents (`PHLEBAS_GATEWAY_MAX_INTENTS`).

Local Next.js only:

```bash
set PHLEBAS_GATEWAY_URL=http://127.0.0.1:8787
```

## Matcher: sequence

`POST /orders` accepts a typed order plus signature. Unsigned session tickets stay in the browser. Persist lives under `services/matcher/.data` and is gitignored. `GET /sequence?after=N` returns receipts after sequence N.

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

Gateway master key: `services/gateway/.data/master.key`. Gateway replay state: `services/gateway/.data/state.json`. Matcher persist: `services/matcher/.data/state.json`. Observer persist: `services/observer/.data/state.json`. Those paths are gitignored. File writes are fsynced and atomically renamed. Windows does not provide a portable directory-fsync barrier, so the implementation skips only that unsupported final barrier after file fsync and rename. Windows also ignores POSIX mode bits, so do not copy these directories onto another host, into git, or onto Vercel. The gateway replay state is what preserves the intent cap across a process restart.

## Incidents

| Signal | Action |
| --- | --- |
| Health fails on loopback | Restart that process. Do not point Vercel at it. |
| Observer disagreement | Stop new attestations. Inspect the payload. Do not mint. |
| Shielded or mixed final tx | Quarantine. Do not mint. |
| Reorg drops an observation | Observer drops off-chain and under-confirmed outpoints. Do not mint. |
| Persist file missing or unreadable after initialization | Service fails closed. Restore a verified snapshot or rebuild under the incident procedure. Never reset sequence or mint history silently. |
| Port bound on `0.0.0.0` on the host | Stop. Host publish must be `127.0.0.1`. |
| Temptation to set gateway/matcher URLs on Vercel | Do not. Vercel stays the public UI only. |

## Out of scope here

- Arbitrum Sepolia `--broadcast`
- `--mark-deployed`
- Mainnet TEX
- Live funds
- Hosted production matcher or custody
