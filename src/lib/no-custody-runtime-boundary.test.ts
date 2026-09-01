import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("the public application has no custody-capable receiver, mint observer, or operator route", async () => {
  const pkg = JSON.parse(await readFile(join(root, "package.json"), "utf8")) as {
    scripts: Record<string, string>;
  };
  const compose = await readFile(join(root, "services/compose.yaml"), "utf8");
  const bridge = await readFile(join(root, "src/components/bridge-panel.tsx"), "utf8");
  const status = await readFile(join(root, "src/lib/status.ts"), "utf8");
  const scanner = await readFile(join(root, "scripts/scan-secrets.mjs"), "utf8");

  assert.equal(pkg.scripts.gateway, undefined);
  assert.equal(pkg.scripts.observer, undefined);
  assert.doesNotMatch(pkg.scripts.test, /services\/(?:gateway|observer)\//);
  assert.doesNotMatch(compose, /\b(?:gateway|observer):/);
  assert.doesNotMatch(compose, /services\/(?:gateway|observer)|(?:gateway|observer)-data/);
  assert.doesNotMatch(bridge, /fetch\(|copyUri|Issue testnet TEX|Copy .* URI/);
  assert.match(bridge, /No address\s+is generated, copied, or accepted/);
  assert.doesNotMatch(status, /PHLEBAS_GATEWAY_URL|intentCap/);
  assert.match(scanner, /git", \["ls-files", "-z"\]/);
  assert.doesNotMatch(scanner, /readdir/);

  const walletAction = await readFile(join(root, "src/lib/stablecoin-wallet-action.ts"), "utf8");
  assert.match(walletAction, /disabled-until-deployment-manifest/);
  assert.doesNotMatch(walletAction, /eth_sendTransaction|eth_sendRawTransaction|wallet_sendCalls/);

  for (const removedPath of [
    "src/app/api/deposit-intent/route.ts",
    "src/lib/deposit-intent.ts",
    "src/lib/gateway-copy.ts",
    "src/lib/intent-cap.ts",
    "services/gateway/server.ts",
    "services/observer/server.ts",
  ]) {
    assert.equal(existsSync(join(root, removedPath)), false, `${removedPath} must remain absent`);
  }
});
