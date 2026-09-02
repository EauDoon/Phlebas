# Ethereum Mainnet settlement recording runbook

This procedure records a Settlement deployment while leaving the persistent
matcher in `no-value` mode. The deployment transaction moves real value and
needs a funded key. Recording a successful receipt and observing code at the
resulting address proves that a deployment exists, but it does not prove that
the runtime bytecode is the reviewed build.

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
and leaves `deployed: false` until the receipt succeeds and well-formed,
nonzero code is observed at the recorded address.

## Step 4: observe deployment evidence and mark recorded

```powershell
node scripts/record-mainnet-deploy.mjs --mark-deployed --rpc-url <MAINNET_RPC_URL>
```

This checks the RPC chain identity and fetches the on-chain code for every
recorded address. It refuses to mark the deployment record if the receipt or
code-presence evidence is missing or malformed.

## Step 5: matcher activation remains blocked

The recorder rejects `--configure-matcher`. The matcher manifests remain
`deployed: false` and `submissionEnabled: false` until a separate reviewed
workflow can compare the observed Settlement runtime bytecode with an exact,
approved identity. Code presence alone cannot authorize live order intake.

Validate the recorded state:

```powershell
npm run check
```

## Rollback

- Set `paused` via the pauser role to halt on-chain settlement.
- Keep `submissionEnabled: false` in the matcher manifests.
- The UI copy follows the manifest state; no code changes are needed to
  stand down.
