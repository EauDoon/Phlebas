import { execFile } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { emptyManifest, recordBroadcast } from "../src/lib/sepolia-manifest.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "infra/testnet/arbitrum-sepolia.json");
const broadcastPath = join(root, "contracts/broadcast/DeployTestnet.s.sol/421614/run-latest.json");
const markDeployed = process.argv.includes("--mark-deployed");
const rpcIndex = process.argv.indexOf("--rpc-url");
const rpcInline = process.argv.find((value) => value.startsWith("--rpc-url="))?.slice("--rpc-url=".length);
const rpcUrl = rpcInline ?? (rpcIndex >= 0 ? process.argv[rpcIndex + 1] : undefined) ?? process.env.ARBITRUM_SEPOLIA_RPC_URL;
const execFileAsync = promisify(execFile);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

const current = await readJson(manifestPath).catch(() => emptyManifest());
let broadcast;
try {
  broadcast = await readJson(broadcastPath);
} catch {
  console.error("No Foundry broadcast at contracts/broadcast/DeployTestnet.s.sol/421614/run-latest.json");
  console.error("Run a Sepolia --broadcast first. Leaving deployed: false.");
  process.exit(1);
}

const { stdout: commit } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: root });
const deployedCode = {};
if (markDeployed) {
  if (!rpcUrl) {
    throw new Error("--mark-deployed requires --rpc-url or ARBITRUM_SEPOLIA_RPC_URL for bytecode verification");
  }
  const provisional = recordBroadcast(current, broadcast, { commit: commit.trim() });
  let requestId = 0;
  for (const address of Object.values(provisional.contracts)) {
    if (!address) continue;
    const response = await fetch(rpcUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: ++requestId, method: "eth_getCode", params: [address, "latest"] }),
    });
    if (!response.ok) throw new Error("Sepolia RPC bytecode verification failed");
    const payload = await response.json();
    if (payload.error || typeof payload.result !== "string") {
      throw new Error("Sepolia RPC returned no verified bytecode result");
    }
    deployedCode[address.toLowerCase()] = payload.result;
  }
}
const next = recordBroadcast(current, broadcast, { markDeployed, commit: commit.trim(), deployedCode });
await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Wrote ${manifestPath}`);
console.log(`deployed: ${next.deployed}`);
console.log(`broadcastTx: ${next.broadcastTx ?? "none"}`);
if (!next.deployed) {
  console.log("Manifest stays deployed: false until --mark-deployed is passed with a real Sepolia tx.");
}
