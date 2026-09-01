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
