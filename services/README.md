# Isolated local services

Gateway, matcher, and the Zebra observer stub run on the operator machine. They are not part of the Vercel app.

Do not set `PHLEBAS_GATEWAY_URL` or `PHLEBAS_MATCHER_URL` on Vercel. Those variables belong only in a local or isolated-host environment.

## Direct

```bash
npm run gateway   # 127.0.0.1:8787
npm run matcher   # 127.0.0.1:8788
npm run observer  # 127.0.0.1:8789
```

`PHLEBAS_BIND` defaults to `127.0.0.1`. Inside Compose it is `0.0.0.0` so published host ports work; Compose still publishes those ports on `127.0.0.1` only.

## Compose

From this directory:

```bash
docker compose up --build
```

| Process | Host address | Role |
| --- | --- | --- |
| gateway | `127.0.0.1:8787` | Single-use `textest` issuance |
| matcher | `127.0.0.1:8788` | Sequenced local book |
| observer | `127.0.0.1:8789` | Zebra + mint-attestation stubs, testnet only |

Local app wiring, never Vercel:

```bash
set PHLEBAS_GATEWAY_URL=http://127.0.0.1:8787
set PHLEBAS_MATCHER_URL=http://127.0.0.1:8788
```

The observer stub does not open a Zebra RPC and does not mint. It accepts textest outpoints, requires explicit fully-transparent observations and 10 confirmations, and durably authorizes at most one mint candidate per outpoint. The Compose volume preserves that replay ledger across restarts.
