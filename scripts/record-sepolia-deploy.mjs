import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { emptyManifest, recordBroadcast } from "../src/lib/sepolia-manifest.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = join(root, "infra/testnet/arbitrum-sepolia.json");
const broadcastPath = join(root, "contracts/broadcast/DeployTestnet.s.sol/421614/run-latest.json");
const markDeployed = process.argv.includes("--mark-deployed");

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

const next = recordBroadcast(current, broadcast, { markDeployed });
await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`);
console.log(`Wrote ${manifestPath}`);
console.log(`deployed: ${next.deployed}`);
console.log(`broadcastTx: ${next.broadcastTx ?? "none"}`);
if (!next.deployed) {
  console.log("Manifest stays deployed: false until --mark-deployed is passed with a real Sepolia tx.");
}
