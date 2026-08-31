import { strict as assert } from "node:assert";
import { test } from "node:test";

import { emptyBook, type Book, type Fill, type RestingOrder } from "./matcher.ts";
import type { SequenceReceipt } from "./matcher-operator.ts";
import { buildPublicSnapshot } from "./market-data-snapshot.ts";

function resting(side: RestingOrder["side"], priceTicks: bigint, remainingAtoms: bigint, seq: number): RestingOrder {
  const id = side + "-" + seq.toString();
  return { id, side, priceTicks, remainingAtoms, seq };
}

function book(): Book {
  const b: Book = emptyBook(5_000n);
  b.bids.push(resting("buy", 4_900n, 1_000n, 1));
  b.bids.push(resting("buy", 4_800n, 2_000n, 2));
  b.asks.push(resting("sell", 5_100n, 1_500n, 3));
  b.asks.push(resting("sell", 5_200n, 3_000n, 4));
  b.seq = 5;
  return b;
}

function fill(priceTicks: bigint, sizeAtoms: bigint): Fill {
  return { makerId: "m1", takerSide: "buy", priceTicks, sizeAtoms };
}

function receipt(seq: number, fills: Fill[]): SequenceReceipt {
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

test("buildPublicSnapshot returns a single combined snapshot", () => {
  const receipts: SequenceReceipt[] = [receipt(1, [fill(5_050n, 1_000n)])];
  const snap = buildPublicSnapshot(book(), receipts, 100n, 5, 10);
  assert.equal(snap.ticker.bestBidTicks, "4900");
  assert.equal(snap.ticker.bestAskTicks, "5100");
  assert.equal(snap.depth.bids.length, 2);
  assert.equal(snap.depth.asks.length, 2);
  assert.equal(snap.trades.count, 1);
});

test("buildPublicSnapshot returns an empty snapshot for an empty book", () => {
  const snap = buildPublicSnapshot(emptyBook(5_000n), [], 100n, 5, 10);
  assert.equal(snap.ticker.bestBidTicks, null);
  assert.equal(snap.depth.bids.length, 0);
  assert.equal(snap.trades.count, 0);
});
