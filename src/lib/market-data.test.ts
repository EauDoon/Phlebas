import assert from "node:assert/strict";
import test from "node:test";

import {
  books,
  chartSeries,
  formatSignedChange,
  markets,
  pools,
  recentTrades,
  type MarketId,
} from "./market-data.ts";

for (const marketId of Object.keys(markets) as MarketId[]) {
  test(`${marketId} ask totals accumulate from best to worst`, () => {
    const asks = books[marketId].asks;
    assert.equal(asks.at(-1)?.totalAtoms, asks.at(-1)?.sizeAtoms);
    for (let index = 1; index < asks.length; index += 1) {
      assert.ok(asks[index - 1].totalAtoms > asks[index].totalAtoms);
    }
  });

  test(`${marketId} bid totals accumulate from best to worst`, () => {
    const bids = books[marketId].bids;
    assert.equal(bids[0].totalAtoms, bids[0].sizeAtoms);
    for (let index = 1; index < bids.length; index += 1) {
      assert.ok(bids[index].totalAtoms > bids[index - 1].totalAtoms);
    }
  });

  test(`${marketId} recent-trade fixture starts at its illustrative last price`, () => {
    assert.equal(recentTrades[marketId][0].priceTicks, markets[marketId].lastTicks);
  });

  test(`${marketId} 24h stats match the 1D series`, () => {
    const series = chartSeries[marketId]["1D"];
    const market = markets[marketId];
    const open = series[0];
    const last = series.at(-1);
    assert.equal(Number(market.highTicks), Math.max(...series));
    assert.equal(Number(market.lowTicks), Math.min(...series));
    assert.equal(Number(market.lastTicks), last);
    assert.equal(market.changeBps, Math.round(((Number(market.lastTicks) - open) * 10_000) / open));
  });
}

test("pool quote reserves stay within one quote atom of last * pZEC reserve", () => {
  for (const pool of pools) {
    const marketId = pool.id === "pZEC/USDT0" ? "ZEC/USDT" : "ZEC/USDC";
    const impliedQuote = (pool.reserveZecAtoms * markets[marketId].lastTicks) / 10_000n;
    const delta = impliedQuote > pool.reserveQuoteAtoms
      ? impliedQuote - pool.reserveQuoteAtoms
      : pool.reserveQuoteAtoms - impliedQuote;
    assert.ok(delta < 1_000000n);
  }
});

test("seed books never store IEEE sizes or prices", () => {
  for (const marketId of Object.keys(books) as MarketId[]) {
    for (const level of [...books[marketId].asks, ...books[marketId].bids]) {
      assert.equal(typeof level.priceTicks, "bigint");
      assert.equal(typeof level.sizeAtoms, "bigint");
      assert.equal(typeof level.totalAtoms, "bigint");
      assert.ok(level.priceTicks > 0n);
      assert.ok(level.sizeAtoms > 0n);
    }
  }
});

test("formats 24h change from integer basis points", () => {
  assert.equal(formatSignedChange(585), "+5.85%");
  assert.equal(formatSignedChange(-120), "-1.20%");
  assert.equal(formatSignedChange(0), "0.00%");
});

test("volume and TVL fixtures stay dollar-shaped strings for labeled display", () => {
  assert.match(markets["ZEC/USDC"].volume, /^\$[\d.]+M$/);
  assert.match(markets["ZEC/USDT"].volume, /^\$[\d.]+M$/);
  for (const pool of pools) {
    assert.match(pool.tvl, /^\$[\d,]+$/);
    assert.match(pool.volume, /^\$[\d,]+$/);
  }
});
