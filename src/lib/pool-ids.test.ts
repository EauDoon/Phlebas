import assert from "node:assert/strict";
import test from "node:test";

import { isPoolId, nextPoolId, POOL_IDS } from "./pool-ids.ts";

test("pool ids wrap under arrow deltas", () => {
  assert.deepEqual([...POOL_IDS], ["pZEC/USDC", "pZEC/USDT0"]);
  assert.equal(isPoolId("pZEC/USDT0"), true);
  assert.equal(isPoolId("pZEC/DAI"), false);
  assert.equal(nextPoolId("pZEC/USDC", 1), "pZEC/USDT0");
  assert.equal(nextPoolId("pZEC/USDT0", 1), "pZEC/USDC");
  assert.equal(nextPoolId("pZEC/USDC", -1), "pZEC/USDT0");
});
