import assert from "node:assert/strict";
import test from "node:test";

import {
  isMarketId,
  MARKET_ID_LABELS,
  MARKET_IDS,
  nextMarketId,
} from "./market-ids.ts";

test("market ids wrap under arrow deltas", () => {
  assert.deepEqual([...MARKET_IDS], ["ZEC/USDC", "ZEC/USDT"]);
  assert.equal(isMarketId("ZEC/USDT"), true);
  assert.equal(isMarketId("ZEC/DAI"), false);
  assert.equal(MARKET_ID_LABELS["ZEC/USDC"], "ZEC / USDC");
  assert.equal(nextMarketId("ZEC/USDC", 1), "ZEC/USDT");
  assert.equal(nextMarketId("ZEC/USDT", 1), "ZEC/USDC");
  assert.equal(nextMarketId("ZEC/USDC", -1), "ZEC/USDT");
});
