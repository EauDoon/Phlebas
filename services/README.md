# Isolated local services

The matcher runs on the operator machine and is not part of the Vercel app. The custody-capable TEX gateway and legacy mint/reserve-attestation observer were removed; no local service issues a receiver, attests a mint, or holds a Zcash private key.

Do not set `PHLEBAS_MATCHER_URL`, `PHLEBAS_MATCHER_USDC_URL`, or `PHLEBAS_MATCHER_USDT_URL` on Vercel. Those variables belong only in a local or isolated-host environment.

Operator steps, health checks, and incident actions: [docs/OPERATOR_RUNBOOK.md](../docs/OPERATOR_RUNBOOK.md).

## Direct

```bash
npm run matcher   # 127.0.0.1:8788
```

`PHLEBAS_BIND` defaults to `127.0.0.1`. Inside Compose it is `0.0.0.0` so published host ports work; Compose still publishes those ports on `127.0.0.1` only.

## Compose

From this directory:

```bash
docker compose up --build
```

| Process | Host address | Role |
| --- | --- | --- |
| matcher-usdc | `127.0.0.1:8788` | ZEC/USDC persistent native-order domain, unconfigured and no-value by default |
| matcher-usdt | `127.0.0.1:8789` | ZEC/USDT persistent native-order domain, unconfigured and no-value by default |

Local app wiring, never Vercel:

```bash
set PHLEBAS_MATCHER_USDC_URL=http://127.0.0.1:8788
set PHLEBAS_MATCHER_USDT_URL=http://127.0.0.1:8789
```

The atomic-swap observer source remains a separate no-value reference component. It is not part of this Compose workflow, has no custody or mint authority, and must not be treated as an operational service without its own release approval.

Each matcher reports honest unconfigured health and requires an exact `PHLEBAS_MATCHER_MARKET_ID`. The two Compose processes use isolated durable single-writer directories. Configured local validation uses the embedding interface described in [ADR 0003](../docs/adr/0003-persistent-native-matcher.md), with one immutable configuration and verifier per process. No configuration enables transaction construction, signing, broadcast, deployment, or custody.
