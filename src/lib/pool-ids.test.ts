import assert from "node:assert/strict";
import test from "node:test";

import { isPoolId, nextPoolId, POOL_IDS } from "./pool-ids.ts";

test("pool ids wrap under arrow deltas", () => {
  assert.deepEqual([...POOL_IDS], ["ZEC/USDC", "ZEC/USDT"]);
  assert.equal(isPoolId("ZEC/USDT"), true);
  assert.equal(isPoolId("ZEC/DAI"), false);
  assert.equal(nextPoolId("ZEC/USDC", 1), "ZEC/USDT");
  assert.equal(nextPoolId("ZEC/USDT", 1), "ZEC/USDC");
  assert.equal(nextPoolId("ZEC/USDC", -1), "ZEC/USDT");
});

test("pool ids wrap for any integer delta, never returning undefined", () => {
  // A single `+ count` in the old modulo only cancelled a delta of magnitude
  // up to `count`; anything stepping further back (delta <= -count) drove
  // the index negative again and POOL_IDS[negative] silently evaluated to
  // undefined instead of a PoolId. Exercise deltas on both sides of that
  // boundary and confirm every result is a real pool id and matches the
  // equivalent smaller delta (same result mod POOL_IDS.length).
  for (const delta of [-101, -100, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 100, 101]) {
    const result = nextPoolId("ZEC/USDC", delta);
    assert.ok(result === "ZEC/USDC" || result === "ZEC/USDT", `delta ${delta} produced ${result}`);
  }
  assert.equal(nextPoolId("ZEC/USDC", -3), nextPoolId("ZEC/USDC", 1));
  assert.equal(nextPoolId("ZEC/USDC", -4), nextPoolId("ZEC/USDC", 0));
  assert.equal(nextPoolId("ZEC/USDT", -101), nextPoolId("ZEC/USDT", 1));
});

test("rejects a non-integer step and an unknown pool id", () => {
  assert.throws(() => nextPoolId("ZEC/USDC", 1.5), /integer/);
  assert.throws(() => nextPoolId("ZEC/DAI" as unknown as Parameters<typeof nextPoolId>[0], 1), /Unknown pool id/);
});
