import assert from "node:assert/strict";
import test from "node:test";

import { simulationStatus } from "./status.ts";

test("status payload never claims live funds or custody", () => {
  const status = simulationStatus();
  assert.equal(status.liveFunds, false);
  assert.equal(status.custody, "none");
  assert.equal(status.deposits, "testnet-gateway-optional");
  assert.equal(status.wallets, "eip-1193-sepolia");
  assert.equal(status.sepoliaSubmit, "flag-off");
  assert.equal(status.matcher, "in-browser");
  assert.equal(status.contracts, "source-undeployed");
  assert.equal(status.mode, "simulation");
  assert.equal(status.marketData, "illustrative");
  assert.equal(status.countryAccess, "deny-default");
  assert.equal(status.sequenceRoot, null);
  assert.equal(status.intentCap, null);
});

test("status exposes operator fields only for loopback operator URLs", () => {
  const remote = simulationStatus({
    PHLEBAS_MATCHER_URL: "https://example.com",
    PHLEBAS_GATEWAY_URL: "http://example.com:8787",
  });
  assert.equal(remote.sequenceRoot, null);
  assert.equal(remote.intentCap, null);
  assert.equal(remote.matcherService, "local-optional");

  const loopback = simulationStatus({
    PHLEBAS_MATCHER_URL: "http://127.0.0.1:8788",
    PHLEBAS_GATEWAY_URL: "http://127.0.0.1:8787",
  });
  assert.equal(loopback.sequenceRoot, null);
  assert.equal(loopback.intentCap, 64);
  assert.equal(loopback.matcherService, "loopback-optional");
});
