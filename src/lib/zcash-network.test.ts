import { strict as assert } from "node:assert";
import { test } from "node:test";

import { assertNetwork, DEFAULT_NETWORK, isApprovedNetwork } from "./zcash-network.ts";

test("isApprovedNetwork accepts testnet and mainnet", () => {
  assert.equal(isApprovedNetwork("testnet"), true);
  assert.equal(isApprovedNetwork("mainnet"), true);
});

test("isApprovedNetwork rejects any other string", () => {
  assert.equal(isApprovedNetwork("regtest"), false);
  assert.equal(isApprovedNetwork(""), false);
  assert.equal(isApprovedNetwork("TESTNET"), false);
});

test("assertNetwork returns the network when approved", () => {
  assert.equal(assertNetwork("testnet"), "testnet");
  assert.equal(assertNetwork("mainnet"), "mainnet");
});

test("assertNetwork throws for an unapproved network", () => {
  assert.throws(() => assertNetwork("regtest"), /not approved/);
});

test("DEFAULT_NETWORK is testnet", () => {
  assert.equal(DEFAULT_NETWORK, "testnet");
});
