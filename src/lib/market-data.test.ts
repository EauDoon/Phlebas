import assert from "node:assert/strict";
import test from "node:test";

import { books, markets, recentTrades, type MarketId } from "./market-data.ts";

for (const marketId of Object.keys(markets) as MarketId[]) {
  test(`${marketId} ask totals accumulate from best to worst`, () => {
    const asks = books[marketId].asks;
    assert.equal(asks.at(-1)?.total, asks.at(-1)?.size);
    for (let index = 1; index < asks.length; index += 1) {
      assert.ok(asks[index - 1].total > asks[index].total);
    }
  });

  test(`${marketId} bid totals accumulate from best to worst`, () => {
    const bids = books[marketId].bids;
    assert.equal(bids[0].total, bids[0].size);
    for (let index = 1; index < bids.length; index += 1) {
      assert.ok(bids[index].total > bids[index - 1].total);
    }
  });

  test(`${marketId} recent-trade fixture starts at its illustrative last price`, () => {
    assert.equal(recentTrades[marketId][0].price, markets[marketId].last);
  });
}
