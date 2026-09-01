import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const ACTIVE_MAINNET_FILES = [
  "infra/matcher/native-zec-usdc.json",
  "infra/matcher/native-zec-usdc.schema.json",
  "infra/matcher/native-zec-usdt.json",
  "infra/matcher/native-zec-usdt.schema.json",
  "src/components/wallet-bar.tsx",
  "src/lib/evm-provider-discovery.ts",
  "src/lib/evm-wallet-session.ts",
  "src/lib/evm-wallet.ts",
  "src/lib/mainnet-assets.ts",
  "src/lib/matcher-wallet.ts",
  "src/lib/native-zec-usdc-matcher-manifest.ts",
  "src/lib/native-zec-usdt-matcher-manifest.ts",
  "src/lib/stablecoin-wallet-action.ts",
] as const;

test("active mainnet wallet and settlement paths cannot reference Arbitrum or Sepolia", async () => {
  for (const path of ACTIVE_MAINNET_FILES) {
    const source = await readFile(join(root, path), "utf8");
    assert.doesNotMatch(source, /\b(?:42161|421614)\b|arbitrum|sepolia/i, path);
  }
});

test("active manifests bind chain 1 and exact issuer token identities", async () => {
  const usdc = JSON.parse(await readFile(join(root, "infra/matcher/native-zec-usdc.json"), "utf8")) as {
    evm: { network: string; chainId: number };
    market: { quote: { asset: string } };
    deployed: boolean;
    submissionEnabled: boolean;
  };
  const usdt = JSON.parse(await readFile(join(root, "infra/matcher/native-zec-usdt.json"), "utf8")) as typeof usdc;
  assert.deepEqual(
    [usdc.evm, usdt.evm].map(({ network, chainId }) => ({ network, chainId })),
    [{ network: "eip155:1", chainId: 1 }, { network: "eip155:1", chainId: 1 }],
  );
  assert.equal(usdc.market.quote.asset, "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48");
  assert.equal(usdt.market.quote.asset, "eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7");
  assert.equal(usdc.deployed || usdc.submissionEnabled || usdt.deployed || usdt.submissionEnabled, false);
});
