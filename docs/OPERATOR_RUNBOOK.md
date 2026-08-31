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

Each process defaults to `127.0.0.1` unless `PHLEBAS_BIND` is set.

## Health

```bash
curl http://127.0.0.1:8787/health
curl http://127.0.0.1:8788/health
curl http://127.0.0.1:8789/health
```

Expect `network: testnet` from gateway and observer. Matcher reports `matcher: local-operator`.

## Gateway: issue a testnet TEX

```bash
curl -X POST http://127.0.0.1:8787/intents
```

The body is a single-use `textest` address and a ZIP 321 URI. Never reuse the address. Never treat this as a mainnet deposit.

Local Next.js only:

```bash
set PHLEBAS_GATEWAY_URL=http://127.0.0.1:8787
```

## Matcher: sequence

`POST /orders` accepts a typed order plus signature. Unsigned session tickets stay in the browser. Persist lives under `services/matcher/.data` and is gitignored.

Local Next.js only:

```bash
set PHLEBAS_MATCHER_URL=http://127.0.0.1:8788
```

## Observer: attest a textest outpoint

`POST /attest` requires a `textest` destination, a fully transparent final transaction, and 10 confirmations. One `(txid, vout)` authorizes at most one mint candidate. Observer disagreement returns an error and does not mint.

This stub does not open Zebra RPC and does not call `PZec.mint`.

## Stop

```bash
docker compose -f services/compose.yaml down
```

Direct processes: interrupt the three Node jobs. Data directories under `services/*/.data` remain local.

## Incidents

| Signal | Action |
| --- | --- |
| Health fails on loopback | Restart that process. Do not point Vercel at it. |
| Observer disagreement | Stop new attestations. Inspect the payload. Do not mint. |
| Shielded or mixed final tx | Quarantine. Do not mint. |
| Port bound on `0.0.0.0` on the host | Stop. Host publish must be `127.0.0.1`. |
| Temptation to set gateway/matcher URLs on Vercel | Do not. Vercel stays the public UI only. |

## Out of scope here

- Arbitrum Sepolia `--broadcast`
- `--mark-deployed`
- Mainnet TEX
- Live funds
- Hosted production matcher or custody
