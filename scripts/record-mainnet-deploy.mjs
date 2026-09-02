// Records an Ethereum Mainnet Settlement deployment from a Foundry
// broadcast into infra/mainnet/ethereum-mainnet.json.
//
// The manifest stays deployed: false until --mark-deployed is passed and
// every recorded address's on-chain bytecode presence has been observed
// through a mainnet RPC. Nothing here trusts the broadcast file alone.
//
// This recorder deliberately cannot enable matcher submission. Code
// presence does not prove that the address contains the reviewed build.
// Matcher activation remains blocked until an exact approved runtime
// identity can be checked against the observed on-chain bytecode.

import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { emptyManifest, ETHEREUM_MAINNET_CHAIN_ID, recordBroadcast } from "../src/lib/mainnet-manifest.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "infra/mainnet/ethereum-mainnet.json");
const broadcastPath = join(root, "contracts/broadcast/DeployMainnet.s.sol/1/run-latest.json");
const markDeployed = process.argv.includes("--mark-deployed");
const configureMatcherRequested = process.argv.includes("--configure-matcher")
  || process.argv.some((value) => value.startsWith("--configure-matcher="));
const rpcIndex = process.argv.indexOf("--rpc-url");
const rpcInline = process.argv.find((value) => value.startsWith("--rpc-url="))?.slice("--rpc-url=".length);
const rpcUrl = rpcInline ?? (rpcIndex >= 0 ? process.argv[rpcIndex + 1] : undefined) ?? process.env.ETHEREUM_MAINNET_RPC_URL;
const execFileAsync = promisify(execFile);

if (configureMatcherRequested) {
  throw new Error(
    "Matcher activation is disabled until the observed Settlement runtime bytecode matches an exact approved identity",
  );
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function writeJson(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

const current = await readJson(manifestPath).catch(() => emptyManifest());
let broadcast;
try {
  broadcast = await readJson(broadcastPath);
} catch {
  console.error("No Foundry broadcast at contracts/broadcast/DeployMainnet.s.sol/1/run-latest.json");
  console.error("Run a mainnet --broadcast first. Leaving deployed: false.");
  process.exit(1);
}

const { stdout: commit } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
const deployedCode = {};
if (markDeployed) {
  if (!rpcUrl) {
    throw new Error("--mark-deployed requires --rpc-url or ETHEREUM_MAINNET_RPC_URL for bytecode verification");
  }
  const provisional = recordBroadcast(current, broadcast, { commit: commit.trim() });
  let requestId = 0;

  // eth_getCode alone does not prove the RPC is even talking to Ethereum
  // Mainnet: an operator can point --rpc-url at the wrong network by
  // mistake (stale env var, wrong keystore profile, a fork or devnet left
  // running), and an address can carry bytecode on more than one chain.
  // Ask the RPC's own chain ID before trusting anything it returns, the
  // same way recordBroadcast refuses a broadcast file from any chain but
  // Ethereum Mainnet.
  const chainIdResponse = await fetch(rpcUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method: "eth_chainId", params: [] }),
  });
  if (!chainIdResponse.ok) throw new Error("Mainnet RPC chain ID check failed");
  const chainIdPayload = await chainIdResponse.json();
  if (chainIdPayload.error || typeof chainIdPayload.result !== "string" || !/^0x[0-9a-fA-F]+$/.test(chainIdPayload.result)) {
    throw new Error("Mainnet RPC returned no usable chain ID");
  }
  if (BigInt(chainIdPayload.result) !== BigInt(ETHEREUM_MAINNET_CHAIN_ID)) {
    throw new Error("--rpc-url is not connected to Ethereum Mainnet (chain ID 1)");
  }

  for (const address of Object.values(provisional.contracts)) {
    if (!address) continue;
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method: "eth_getCode", params: [address, "latest"] }),
    });
    if (!response.ok) throw new Error("Mainnet RPC bytecode verification failed");
    const payload = await response.json();
    if (payload.error || typeof payload.result !== "string") {
      throw new Error("Mainnet RPC returned no usable bytecode result");
    }
    deployedCode[address.toLowerCase()] = payload.result;
  }
}
const next = recordBroadcast(current, broadcast, { markDeployed, commit: commit.trim(), deployedCode });
await writeJson(manifestPath, next);
console.log(`Wrote ${manifestPath}`);
console.log(`deployed: ${next.deployed}`);
console.log(`Settlement: ${next.contracts.Settlement ?? "none"}`);
console.log(`broadcastTx: ${next.broadcastTx ?? "none"}`);
if (!next.deployed) {
  console.log("Manifest stays deployed: false until --mark-deployed is passed with a real mainnet tx.");
  process.exit(0);
}
