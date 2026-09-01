import assert from "node:assert/strict";
import test from "node:test";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { simulationStatus } from "./status.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("status payload never claims live funds or custody", async () => {
  const statusRoute = await readFile(join(root, "src/app/api/status/route.ts"), "utf8");
  assert.match(statusRoute, /Response\.json\(simulationStatus\(\)/);
  const status = simulationStatus();
  assert.equal(status.liveFunds, false);
  assert.equal(status.custody, "none");
  assert.equal(status.deposits, "disabled-fill-specific-wallet-locks");
  assert.equal(status.withdrawals, "disabled-claim-or-refund-only");
  assert.equal(status.wallets, "eip-6963-ethereum-mainnet");
  assert.equal(status.mainnetTransactions, "disabled-until-deployment-evidence");
  assert.equal(status.matcher, "in-browser");
  assert.equal(status.matcherService, "off");
  assert.equal(status.matcherTarget, "persistent-signed-order-v1");
  assert.equal(status.matcherExecution, "blocked-no-value-swap-plans");
  assert.equal(status.solverLiquidity, "wallet-held-signed-quotes");
  assert.equal(status.authoritativeJournal, "off-vercel");
  assert.equal(status.contracts, "conditional-lock-undeployed");
  assert.equal(status.network, "zcash-mainnet-and-ethereum-mainnet");
  assert.equal(status.mode, "preview");
  assert.equal(status.marketData, "illustrative");
  assert.equal(status.countryAccess, "deny-default");
  assert.equal(status.incidents, "architecture-demonstration");
  assert.equal(status.sequenceRoot, null);
});

test("vercel.json does not assign operator URLs", async () => {
  const vercelPath = join(root, "vercel.json");
  if (!existsSync(vercelPath)) {
    assert.equal(existsSync(vercelPath), false);
    return;
  }
  const vercel = await readFile(vercelPath, "utf8");
  assert.doesNotMatch(vercel, /PHLEBAS_MATCHER_URL\s*[:=]/);
  assert.doesNotMatch(vercel, /PHLEBAS_MATCHER_(?:USDC|USDT)_URL\s*[:=]/);
});

test("status exposes matcher fields only for loopback operator URLs", () => {
  const remote = simulationStatus({
    PHLEBAS_MATCHER_URL: "https://example.com",
  });
  assert.equal(remote.sequenceRoot, null);
  assert.equal(remote.matcherService, "off");

  const loopback = simulationStatus({
    PHLEBAS_MATCHER_URL: "http://127.0.0.1:8788",
  });
  assert.equal(loopback.sequenceRoot, null);
  assert.equal(loopback.matcherService, "persistent-native-v1-loopback-usdc");

  const both = simulationStatus({
    PHLEBAS_MATCHER_USDC_URL: "http://127.0.0.1:8788",
    PHLEBAS_MATCHER_USDT_URL: "http://127.0.0.1:8789",
  });
  assert.equal(both.matcherService, "persistent-native-v1-loopback-both");
});
