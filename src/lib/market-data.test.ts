import assert from "node:assert/strict";
import test from "node:test";

import { books, chartSeries, markets, pools, recentTrades, type MarketId } from "./market-data.ts";

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

  test(`${marketId} 24h stats match the 1D series`, () => {
    const series = chartSeries[marketId]["1D"];
    const market = markets[marketId];
    const open = series[0];
    assert.equal(market.high, Math.max(...series));
    assert.equal(market.low, Math.min(...series));
    assert.equal(market.last, series.at(-1));
    assert.equal(market.change, Number((((market.last - open) / open) * 100).toFixed(2)));
  });
}

test("pool quote reserves match pZEC reserve times the market last", () => {
  for (const pool of pools) {
    const marketId = pool.id === "pZEC/USDT0" ? "ZEC/USDT" : "ZEC/USDC";
    const impliedQuote = pool.reserveZec * markets[marketId].last;
    assert.ok(Math.abs(impliedQuote - pool.reserveQuote) < 1);
  }
});
