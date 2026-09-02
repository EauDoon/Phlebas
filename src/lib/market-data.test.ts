import assert from "node:assert/strict";
import test from "node:test";

import { emptyBook, type Book, type Fill, type RestingOrder } from "./matcher.ts";
import type { SequenceReceipt } from "./matcher-operator.ts";
import {
  books,
  chartSeries,
  depthFromBook,
  formatSignedChange,
  markets,
  marketsFromOperator,
  pools,
  recentTrades,
  tickerFromOperator,
  topFills,
  tradesFromReceipts,
  zecAtomsFromHundredths,
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

test("zecAtomsFromHundredths scales hundredths to 8-decimal atoms", () => {
  assert.equal(zecAtomsFromHundredths(1n), 1_000000n);
  assert.equal(zecAtomsFromHundredths(1564n), 1564n * 1_000000n);
});

test("seed book sizes use zecAtomsFromHundredths", () => {
  assert.equal(books["ZEC/USDC"].asks[0]?.sizeAtoms, zecAtomsFromHundredths(1564n));
  assert.equal(books["ZEC/USDT"].bids[0]?.sizeAtoms, zecAtomsFromHundredths(1549n));
});

test("pool quote reserves stay within one quote atom of last * ZEC reserve", () => {
  for (const pool of pools) {
    const marketId = pool.id === "ZEC/USDT" ? "ZEC/USDT" : "ZEC/USDC";
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

// ---------------------------------------------------------------------------
// PR 5: public market data functions over the live matcher operator.
// ---------------------------------------------------------------------------

function resting(side: RestingOrder["side"], priceTicks: bigint, remainingAtoms: bigint, seq: number): RestingOrder {
  const id = side + "-" + seq.toString();
  return { id, side, priceTicks, remainingAtoms, seq };
}

function liveBook(): Book {
  const b: Book = emptyBook(5_000n);
  b.bids.push(resting("buy", 4_900n, 1_000n, 1));
  b.bids.push(resting("buy", 4_900n, 2_000n, 2));
  b.bids.push(resting("buy", 4_800n, 5_000n, 3));
  b.asks.push(resting("sell", 5_100n, 1_500n, 4));
  b.asks.push(resting("sell", 5_200n, 3_000n, 5));
  b.seq = 6;
  return b;
}

function liveFill(priceTicks: bigint, sizeAtoms: bigint, makerId: string): Fill {
  return { makerId, takerSide: "buy", priceTicks, sizeAtoms };
}

function liveReceipt(seq: number, fills: Fill[]): SequenceReceipt {
  return {
    sequence: seq,
    digest: "0x" + seq.toString(16).padStart(64, "0"),
    maker: "0x" + "11".repeat(20),
    signature: "0x" + "22".repeat(65),
    status: "filled",
    remainingAtoms: "0",
    fills,
  };
}

test("tickerFromOperator reports bid, ask, mid, spread, last, and 24h volume", () => {
  const b = liveBook();
  const receipts: SequenceReceipt[] = [
    liveReceipt(1, [liveFill(4_950n, 1_000n, "m1")]),
    liveReceipt(2, [liveFill(5_050n, 2_000n, "m2")]),
  ];
  const t = tickerFromOperator(b, receipts, 100n);
  assert.equal(t.bestBidTicks, "4900");
  assert.equal(t.bestAskTicks, "5100");
  assert.equal(t.midTicks, "5000");
  assert.equal(t.spreadTicks, "200");
  assert.equal(t.lastPriceTicks, "5050");
  assert.equal(t.highTicks24h, "5050");
  assert.equal(t.lowTicks24h, "4950");
  assert.equal(t.volumeBase24h, "3000");
  assert.equal(t.tradeCount24h, 2);
  assert.equal(t.sequence, 6);
});

test("tickerFromOperator returns null fields for an empty book", () => {
  const t = tickerFromOperator(emptyBook(5_000n), [], 100n);
  assert.equal(t.bestBidTicks, null);
  assert.equal(t.bestAskTicks, null);
  assert.equal(t.midTicks, null);
  assert.equal(t.spreadTicks, null);
  assert.equal(t.lastPriceTicks, null);
  assert.equal(t.volumeBase24h, "0");
  assert.equal(t.tradeCount24h, 0);
});

test("tickerFromOperator rejects a non-positive window", () => {
  assert.throws(() => tickerFromOperator(liveBook(), [], 100n, 0n));
  assert.throws(() => tickerFromOperator(liveBook(), [], 100n, -1n));
});

test("tickerFromOperator rejects a negative now", () => {
  assert.throws(() => tickerFromOperator(liveBook(), [], -1n));
});

test("depthFromBook aggregates same-price orders and limits levels", () => {
  const d = depthFromBook(liveBook(), 2, 100n);
  assert.equal(d.bids.length, 2);
  assert.equal(d.bids[0].priceTicks, "4900");
  assert.equal(d.bids[0].sizeAtoms, "3000");
  assert.equal(d.bids[0].orderCount, 2);
  assert.equal(d.bids[1].priceTicks, "4800");
  assert.equal(d.bids[1].orderCount, 1);
  assert.equal(d.asks.length, 2);
  assert.equal(d.asks[0].priceTicks, "5100");
  assert.equal(d.asks[0].sizeAtoms, "1500");
});

test("depthFromBook with zero levels returns empty arrays", () => {
  const d = depthFromBook(liveBook(), 0, 100n);
  assert.equal(d.bids.length, 0);
  assert.equal(d.asks.length, 0);
});

test("depthFromBook rejects a negative level count", () => {
  assert.throws(() => depthFromBook(liveBook(), -1, 100n));
});

test("tradesFromReceipts walks receipts in reverse and respects the limit", () => {
  const receipts: SequenceReceipt[] = [
    liveReceipt(1, [liveFill(4_950n, 1_000n, "m1")]),
    liveReceipt(2, [liveFill(5_000n, 2_000n, "m2"), liveFill(5_050n, 500n, "m3")]),
  ];
  const snap = tradesFromReceipts(receipts, 10, 100n);
  assert.equal(snap.count, 3);
  assert.equal(snap.trades[0].receiptSequence, 2);
  assert.equal(snap.trades[0].sizeAtoms, "2000");
  assert.equal(snap.trades[1].receiptSequence, 2);
  assert.equal(snap.trades[2].receiptSequence, 1);
});

test("tradesFromReceipts respects the limit", () => {
  const receipts: SequenceReceipt[] = [
    liveReceipt(1, [liveFill(4_950n, 1_000n, "m1")]),
    liveReceipt(2, [liveFill(5_000n, 2_000n, "m2"), liveFill(5_050n, 500n, "m3")]),
  ];
  const snap = tradesFromReceipts(receipts, 1, 100n);
  assert.equal(snap.count, 1);
  assert.equal(snap.trades[0].receiptSequence, 2);
});

test("tradesFromReceipts rejects a negative limit", () => {
  assert.throws(() => tradesFromReceipts([], -1, 100n));
});

test("marketsFromOperator reads the base and quote assets from the operator", () => {
  const m = marketsFromOperator("0xbase", ["0xusdc", "0xusdt"], liveBook());
  assert.equal(m.baseAsset, "0xbase");
  assert.equal(m.quoteAssets.length, 2);
  assert.equal(m.lastTicks, "5000");
  assert.equal(m.sequence, 6);
});

test("marketsFromOperator accepts a Set of quote assets", () => {
  const set = new Set(["0xusdc"]);
  const m = marketsFromOperator("0xbase", set, liveBook());
  assert.equal(m.quoteAssets.length, 1);
  assert.equal(m.quoteAssets[0], "0xusdc");
});

test("topFills returns the most recent fills up to the limit", () => {
  const receipts: SequenceReceipt[] = [
    liveReceipt(1, [liveFill(4_950n, 1_000n, "m1"), liveFill(4_960n, 500n, "m2")]),
    liveReceipt(2, [liveFill(5_000n, 2_000n, "m3"), liveFill(5_010n, 100n, "m4")]),
  ];
  const out = topFills(receipts, 2);
  assert.equal(out.length, 2);
  assert.equal(out[0].priceTicks, 5_000n);
  assert.equal(out[1].priceTicks, 5_010n);
});

test("topFills rejects a negative limit", () => {
  assert.throws(() => topFills([], -1));
});

test("tickerFromOperator counts recent trades under a real clock", () => {
  // The window used to be applied by comparing receipt.sequence, a counter
  // starting at 1, against nowSeconds minus the window. Under any real
  // clock that cutoff is in the billions, so every receipt was excluded
  // and the 24h figures came back empty however recent the trades were.
  // The old test only ever passed nowSeconds = 100n, which drove the
  // cutoff negative and hid it.
  const now = 1_788_327_627n;
  const fresh = { ...liveReceipt(1, [liveFill(4_950n, 1_000n, "m1")]), observedAtSeconds: (now - 60n).toString() };
  const ticker = tickerFromOperator(liveBook(), [fresh], now);
  assert.equal(ticker.tradeCount24h, 1);
  assert.equal(ticker.highTicks24h, "4950");
  assert.equal(ticker.volumeBase24h, "1000");
});

test("tickerFromOperator drops a trade older than the window", () => {
  const now = 1_788_327_627n;
  const stale = { ...liveReceipt(1, [liveFill(4_950n, 1_000n, "m1")]), observedAtSeconds: (now - 90_000n).toString() };
  const ticker = tickerFromOperator(liveBook(), [stale], now);
  assert.equal(ticker.tradeCount24h, 0);
  assert.equal(ticker.highTicks24h, null);
  assert.equal(ticker.volumeBase24h, "0");
});

test("tickerFromOperator keeps a receipt that predates the timestamp field", () => {
  // Not knowing when a receipt happened is not evidence that it happened
  // outside the window, and dropping it is what emptied the ticker.
  const now = 1_788_327_627n;
  const untimed = liveReceipt(1, [liveFill(4_950n, 1_000n, "m1")]);
  assert.equal(untimed.observedAtSeconds, undefined);
  assert.equal(tickerFromOperator(liveBook(), [untimed], now).tradeCount24h, 1);
});
