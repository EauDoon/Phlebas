# Ethereum Mainnet settlement deployment runbook

This is the procedure that takes the persistent matcher out of `no-value`
mode. Every step after the deploy is deterministic and verified by the
repo's own validators; only the deployment transaction itself moves real
value, so it is the only step that needs your funded key.

## Before you start — three decisions to make explicitly

1. **The base-leg token.** `Settlement.sol` settles the base leg as an
   ERC-20 at the `PHLEBAS_ZEC_TOKEN` address. On mainnet this must be a
   ZEC-representing token you have vetted. The native Zcash HTLC leg
   (`transparent-htlc-v1` in the matcher manifests) is separate: real ZEC
   moves on the Zcash chain. Know which surface you are funding before you
   broadcast.
2. **An audit.** `Settlement.sol` and `ConditionalLock.sol` are flagged in
   the repository history as awaiting external audit. Enabling mainnet
   value movement before that audit is a risk decision only you can make;
   the repo records it, it does not block it.
3. **Roles.** `pauser`, `governor`, and `feeRecipient` must be distinct,
   operationally reachable keys. The pauser can halt settlement in an
   incident; keep that key warm and backed up.

## Step 1 — build and inspect

```powershell
npm run build:contracts
npm run test:contracts
```

## Step 2 — the deployment transaction (your key, your machine)

```powershell
$env:PHLEBAS_DEPLOYER      = "<funded deployer EOA address>"
$env:PHLEBAS_ZEC_TOKEN     = "<vetted ZEC-representing ERC-20 address>"
$env:PHLEBAS_FEE_RECIPIENT = "<fee destination>"
$env:PHLEBAS_PAUSER        = "<pause role>"
$env:PHLEBAS_GOVERNOR      = "<unpause role>"

forge script DeployMainnet --rpc-url <MAINNET_RPC_URL> --broadcast
```

Keep the private key out of shell history: use a Foundry keystore
(`cast wallet import`) and `--account`, or an air-gapped signing setup.
The broadcast lands in `contracts/broadcast/DeployMainnet.s.sol/1/`.

## Step 3 — record the deployment (no key needed)

```powershell
node scripts/record-mainnet-deploy.mjs
```

This reads the broadcast, writes `infra/mainnet/ethereum-mainnet.json`,
and leaves `deployed: false` until the receipt and bytecode are verified.

## Step 4 — verify against the chain and mark deployed

```powershell
node scripts/record-mainnet-deploy.mjs --mark-deployed --rpc-url <MAINNET_RPC_URL>
```

This fetches the on-chain code for every recorded address and refuses to
mark deployed if any verification fails.

## Step 5 — configure the matcher manifests

```powershell
node scripts/record-mainnet-deploy.mjs --mark-deployed --rpc-url <MAINNET_RPC_URL> --configure-matcher both
```

Writes the Settlement address as the EIP-712 `verifyingContract`, the
deterministic configuration hash, and `deployed/submissionEnabled: true`
into `infra/matcher/native-zec-usdc.json` and `native-zec-usdt.json`.

Validate the whole repo against the new state:

```powershell
npm run check
```

## Step 6 — bring the matcher up

Start the persistent matcher service (Compose or `npm run matcher`) with
`PHLEBAS_MATCHER_USDC_URL` / `PHLEBAS_MATCHER_USDT_URL` pointed at the
loopback URLs the Next.js routes proxy to, then confirm:

```powershell
curl http://127.0.0.1:8788/health
# expect "configured": true, "acceptingMutations": true
```

From this point the terminal's native matcher path serves live sequenced
orders instead of fixtures, and the UI gates lift through the capability
path already in place.

## Rollback

- Set `paused` via the pauser role to halt on-chain settlement.
- Flip `submissionEnabled: false` in the matcher manifests and restart the
  matcher to stop accepting orders.
- The UI copy follows the manifest state; no code changes are needed to
  stand down.
