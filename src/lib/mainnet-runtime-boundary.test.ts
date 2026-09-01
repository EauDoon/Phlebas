import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

const ACTIVE_MAINNET_FILES = [
  "infra/matcher/native-zec-usdc.json",
  "infra/matcher/native-zec-usdc.schema.json",
  "infra/matcher/native-zec-usdt.json",
  "infra/matcher/native-zec-usdt.schema.json",
  "src/components/native-swap-fixtures.ts",
  "src/components/settlement-ticket.tsx",
  "src/components/architecture-panel.tsx",
  "src/components/liquidity-panel.tsx",
  "src/components/trade-ticket.tsx",
  "src/components/wallet-bar.tsx",
  "src/app/status/page.tsx",
  "src/lib/encoding.ts",
  "src/lib/evm-provider-discovery.ts",
  "src/lib/evm-wallet-session.ts",
  "src/lib/evm-wallet.ts",
  "src/lib/mainnet-assets.ts",
  "src/lib/matcher-wallet.ts",
  "src/lib/native-zec-usdc-matcher-manifest.ts",
  "src/lib/native-zec-usdt-matcher-manifest.ts",
  "src/lib/stablecoin-wallet-action.ts",
  "src/lib/market-data.ts",
  "src/lib/review-copy.ts",
  "src/lib/settlement-ticket-copy.ts",
  "src/lib/status.ts",
  "src/lib/ticket-expiry.ts",
  "src/lib/withdrawal-tour.ts",
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

test("active application code cannot supply its own stablecoin deployment authority", async () => {
  const pending = [join(root, "src"), join(root, "services")];
  const sources: string[] = [];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
      } else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)) {
        sources.push(absolute);
      }
    }
  }
  for (const absolute of sources) {
    const path = relative(root, absolute).replaceAll("\\", "/");
    if (path === "src/lib/stablecoin-wallet-action.ts") continue;
    const source = await readFile(absolute, "utf8");
    assert.doesNotMatch(source, /(?:Funding|Claim|Refund)ActionWithAuthority|StablecoinLockDeploymentAuthority/, path);
  }
});

test("retired Sepolia wallet submission cannot be re-enabled from shipped application source", async () => {
  assert.equal(existsSync(join(root, "src/lib/sepolia-submit.ts")), false);
  assert.equal(existsSync(join(root, "src/lib/sepolia-submit.test.ts")), false);
  const packageJson = await readFile(join(root, "package.json"), "utf8");
  const readme = await readFile(join(root, "README.md"), "utf8");
  const contractsReadme = await readFile(join(root, "contracts/README.md"), "utf8");
  assert.doesNotMatch(packageJson, /record:sepolia|NEXT_PUBLIC_PHLEBAS_SEPOLIA_SUBMIT/);
  assert.doesNotMatch(readme, /NEXT_PUBLIC_PHLEBAS_SEPOLIA_SUBMIT|Local wallet submission remains disabled unless/);
  assert.doesNotMatch(contractsReadme, /Arbitrum Sepolia deploy|--broadcast|--mark-deployed/);

  const pending = [join(root, "src")];
  while (pending.length > 0) {
    const directory = pending.pop()!;
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory()) {
        pending.push(absolute);
      } else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.test\.(?:ts|tsx)$/.test(entry.name)) {
        const source = await readFile(absolute, "utf8");
        const path = relative(root, absolute).replaceAll("\\", "/");
        assert.doesNotMatch(source, /eth_sendTransaction|NEXT_PUBLIC_PHLEBAS_SEPOLIA_SUBMIT/, path);
      }
    }
  }
});
