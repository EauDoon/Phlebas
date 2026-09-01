// Combined public market data snapshot. The snapshot combines the
// ticker, depth, and trades into a single response. The snapshot
// is the convenience surface for clients that want a single
// round-trip per refresh. The snapshot is built from the same
// pure functions as the per-endpoint surface; the snapshot never
// mutates the matcher operator.

import type { Book } from "./matcher.ts";
import type { SequenceReceipt } from "./matcher-operator.ts";
import {
  depthFromBook,
  tickerFromOperator,
  tradesFromReceipts,
  type DepthSnapshot,
  type Ticker,
  type TradeSnapshot,
} from "./market-data.ts";

export type PublicSnapshot = Readonly<{
  ticker: Ticker;
  depth: DepthSnapshot;
  trades: TradeSnapshot;
}>;

export function buildPublicSnapshot(
  book: Book,
  receipts: ReadonlyArray<SequenceReceipt>,
  nowSeconds: bigint,
  depthLevels: number,
  tradeLimit: number,
): PublicSnapshot {
  return {
    ticker: tickerFromOperator(book, receipts, nowSeconds),
    depth: depthFromBook(book, depthLevels, nowSeconds),
    trades: tradesFromReceipts(receipts, tradeLimit, nowSeconds),
  };
}
