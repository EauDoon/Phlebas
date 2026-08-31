export type MarketId = "ZEC/USDC" | "ZEC/USDT";
export type ChartRange = "1H" | "4H" | "1D";

export type Market = {
  id: MarketId;
  settlementPair: "ZEC-USDC" | "ZEC-USDT";
  quote: "USDC" | "USDT";
  lastTicks: bigint;
  changeBps: number;
  highTicks: bigint;
  lowTicks: bigint;
  volume: string;
};

export type BookLevel = {
  priceTicks: bigint;
  sizeAtoms: bigint;
  totalAtoms: bigint;
};

export type RecentTrade = {
  priceTicks: bigint;
  sizeAtoms: bigint;
  side: "buy" | "sell";
  time: string;
};

export function zecAtomsFromHundredths(hundredths: bigint): bigint {
  return hundredths * 1_000000n;
}

function accumulate(
  levels: ReadonlyArray<{ priceTicks: bigint; sizeAtoms: bigint }>,
  accumulateFrom: "start" | "end",
): BookLevel[] {
  const next = levels.map((level) => ({ ...level, totalAtoms: 0n }));
  const indexes = [...next.keys()];
  if (accumulateFrom === "end") indexes.reverse();

  let total = 0n;
  for (const index of indexes) {
    total += next[index].sizeAtoms;
    next[index].totalAtoms = total;
  }
  return next;
}

export const markets: Record<MarketId, Market> = {
  "ZEC/USDC": {
    id: "ZEC/USDC",
    settlementPair: "ZEC-USDC",
    quote: "USDC",
    lastTicks: 5284n,
    changeBps: 585,
    highTicks: 5284n,
    lowTicks: 4992n,
    volume: "$1.84M",
  },
  "ZEC/USDT": {
    id: "ZEC/USDT",
    settlementPair: "ZEC-USDT",
    quote: "USDT",
    lastTicks: 5279n,
    changeBps: 583,
    highTicks: 5279n,
    lowTicks: 4988n,
    volume: "$1.12M",
  },
};

export const chartSeries: Record<MarketId, Record<ChartRange, readonly number[]>> = {
  "ZEC/USDC": {
    "1H": [5182, 5168, 5193, 5206, 5197, 5218, 5211, 5246, 5238, 5261, 5249, 5284],
    "4H": [5072, 5096, 5081, 5114, 5147, 5135, 5188, 5222, 5205, 5241, 5266, 5284],
    "1D": [4992, 5021, 5004, 5068, 5044, 5116, 5102, 5174, 5208, 5191, 5242, 5284],
  },
  "ZEC/USDT": {
    "1H": [5177, 5164, 5189, 5201, 5193, 5214, 5208, 5241, 5233, 5256, 5244, 5279],
    "4H": [5068, 5091, 5076, 5109, 5142, 5130, 5183, 5217, 5200, 5236, 5261, 5279],
    "1D": [4988, 5017, 5000, 5063, 5040, 5111, 5098, 5169, 5203, 5186, 5237, 5279],
  },
};

export const books: Record<MarketId, { asks: BookLevel[]; bids: BookLevel[] }> = {
  "ZEC/USDC": {
    asks: accumulate(
      [
        { priceTicks: 5318n, sizeAtoms: zecAtomsFromHundredths(1564n) },
        { priceTicks: 5312n, sizeAtoms: zecAtomsFromHundredths(1981n) },
        { priceTicks: 5308n, sizeAtoms: zecAtomsFromHundredths(2398n) },
        { priceTicks: 5302n, sizeAtoms: zecAtomsFromHundredths(2815n) },
        { priceTicks: 5297n, sizeAtoms: zecAtomsFromHundredths(1132n) },
        { priceTicks: 5291n, sizeAtoms: zecAtomsFromHundredths(1549n) },
      ],
      "end",
    ),
    bids: accumulate(
      [
        { priceTicks: 5278n, sizeAtoms: zecAtomsFromHundredths(2815n) },
        { priceTicks: 5273n, sizeAtoms: zecAtomsFromHundredths(1132n) },
        { priceTicks: 5269n, sizeAtoms: zecAtomsFromHundredths(1549n) },
        { priceTicks: 5263n, sizeAtoms: zecAtomsFromHundredths(1966n) },
        { priceTicks: 5257n, sizeAtoms: zecAtomsFromHundredths(2383n) },
        { priceTicks: 5251n, sizeAtoms: zecAtomsFromHundredths(2800n) },
      ],
      "start",
    ),
  },
  "ZEC/USDT": {
    asks: accumulate(
      [
        { priceTicks: 5313n, sizeAtoms: zecAtomsFromHundredths(2398n) },
        { priceTicks: 5307n, sizeAtoms: zecAtomsFromHundredths(2815n) },
        { priceTicks: 5303n, sizeAtoms: zecAtomsFromHundredths(1132n) },
        { priceTicks: 5297n, sizeAtoms: zecAtomsFromHundredths(1549n) },
        { priceTicks: 5292n, sizeAtoms: zecAtomsFromHundredths(1966n) },
        { priceTicks: 5286n, sizeAtoms: zecAtomsFromHundredths(2383n) },
      ],
      "end",
    ),
    bids: accumulate(
      [
        { priceTicks: 5273n, sizeAtoms: zecAtomsFromHundredths(1549n) },
        { priceTicks: 5268n, sizeAtoms: zecAtomsFromHundredths(1966n) },
        { priceTicks: 5264n, sizeAtoms: zecAtomsFromHundredths(2383n) },
        { priceTicks: 5258n, sizeAtoms: zecAtomsFromHundredths(2800n) },
        { priceTicks: 5252n, sizeAtoms: zecAtomsFromHundredths(1117n) },
        { priceTicks: 5246n, sizeAtoms: zecAtomsFromHundredths(1534n) },
      ],
      "start",
    ),
  },
};

export const recentTrades: Record<MarketId, readonly RecentTrade[]> = {
  "ZEC/USDC": [
    { priceTicks: 5284n, sizeAtoms: zecAtomsFromHundredths(340n), side: "buy", time: "14:32:08" },
    { priceTicks: 5281n, sizeAtoms: zecAtomsFromHundredths(812n), side: "sell", time: "14:31:54" },
    { priceTicks: 5282n, sizeAtoms: zecAtomsFromHundredths(176n), side: "buy", time: "14:31:41" },
    { priceTicks: 5278n, sizeAtoms: zecAtomsFromHundredths(1205n), side: "sell", time: "14:31:27" },
    { priceTicks: 5280n, sizeAtoms: zecAtomsFromHundredths(544n), side: "buy", time: "14:31:12" },
  ],
  "ZEC/USDT": [
    { priceTicks: 5279n, sizeAtoms: zecAtomsFromHundredths(340n), side: "buy", time: "14:32:08" },
    { priceTicks: 5276n, sizeAtoms: zecAtomsFromHundredths(812n), side: "sell", time: "14:31:54" },
    { priceTicks: 5277n, sizeAtoms: zecAtomsFromHundredths(176n), side: "buy", time: "14:31:41" },
    { priceTicks: 5273n, sizeAtoms: zecAtomsFromHundredths(1205n), side: "sell", time: "14:31:27" },
    { priceTicks: 5275n, sizeAtoms: zecAtomsFromHundredths(544n), side: "buy", time: "14:31:12" },
  ],
};

export const pools = [
  {
    id: "ZEC/USDC",
    quote: "USDC",
    fee: "0.30%",
    tvl: "$842,410",
    volume: "$311,820",
    reserveZecAtoms: 797_132_000000n,
    reserveQuoteAtoms: 421_205_000000n,
  },
  {
    id: "ZEC/USDT",
    quote: "USDT",
    fee: "0.30%",
    tvl: "$516,920",
    volume: "$188,460",
    reserveZecAtoms: 489_600_000000n,
    reserveQuoteAtoms: 258_460_000000n,
  },
] as const;

export function formatSignedChange(changeBps: number): string {
  const sign = changeBps > 0 ? "+" : changeBps < 0 ? "-" : "";
  const absolute = Math.abs(changeBps);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}%`;
}

// ---------------------------------------------------------------------------
// PR 5: public market data over the matcher's live operator state.
//
// The exports above (markets, books, recentTrades, pools) are the
// no-value paper-trading fixtures consumed by the frontend simulation.
// The exports below are pure functions over the matcher's live
// MatcherOperator, exposed by the /ticker, /trades, /depth, and
// /markets HTTP endpoints. The two surfaces never share state; the
// fixtures stay frozen until a real Sepolia deployment is recorded.
// ---------------------------------------------------------------------------

import type { Book, Fill, RestingOrder } from "./matcher.ts";
import type { SequenceReceipt } from "./matcher-operator.ts";

export type Ticker = Readonly<{
  bestBidTicks: string | null;
  bestAskTicks: string | null;
  midTicks: string | null;
  spreadTicks: string | null;
  lastPriceTicks: string | null;
  highTicks24h: string | null;
  lowTicks24h: string | null;
  volumeBase24h: string;
  volumeQuote24h: string;
  tradeCount24h: number;
  sequence: number;
  generatedAt: bigint;
}>;

export type DepthLevel = Readonly<{
  priceTicks: string;
  sizeAtoms: string;
  orderCount: number;
}>;

export type DepthSnapshot = Readonly<{
  bids: ReadonlyArray<DepthLevel>;
  asks: ReadonlyArray<DepthLevel>;
  sequence: number;
  generatedAt: bigint;
}>;

export type PublicTrade = Readonly<{
  receiptSequence: number;
  side: "buy" | "sell";
  priceTicks: string;
  sizeAtoms: string;
  makerId: string;
  observedAt: bigint;
}>;

export type TradeSnapshot = Readonly<{
  trades: ReadonlyArray<PublicTrade>;
  count: number;
  generatedAt: bigint;
}>;

export type MarketDescriptor = Readonly<{
  baseAsset: string | null;
  quoteAssets: ReadonlyArray<string>;
  lastTicks: string;
  sequence: number;
}>;

const TICKS_PER_UNIT = 10_000n;

function topOfBook(book: Book): { bid: RestingOrder | null; ask: RestingOrder | null } {
  return { bid: book.bids[0] ?? null, ask: book.asks[0] ?? null };
}

function lastPriceFromReceipts(receipts: ReadonlyArray<SequenceReceipt>): bigint | null {
  for (let i = receipts.length - 1; i >= 0; i--) {
    const receipt = receipts[i];
    if (!receipt || receipt.fills.length === 0) continue;
    const fill = receipt.fills[receipt.fills.length - 1];
    if (!fill) continue;
    return fill.priceTicks;
  }
  return null;
}

function rangeFromReceipts(
  receipts: ReadonlyArray<SequenceReceipt>,
  windowSeconds: bigint,
  nowSeconds: bigint,
): { high: bigint | null; low: bigint | null; volumeBase: bigint; volumeQuote: bigint; count: number } {
  const cutoff = nowSeconds - windowSeconds;
  let high: bigint | null = null;
  let low: bigint | null = null;
  let volumeBase = 0n;
  let volumeQuote = 0n;
  let count = 0;
  for (const receipt of receipts) {
    if (receipt.fills.length === 0) continue;
    if (BigInt(receipt.sequence) < cutoff) continue;
    for (const fill of receipt.fills) {
      if (high === null || fill.priceTicks > high) high = fill.priceTicks;
      if (low === null || fill.priceTicks < low) low = fill.priceTicks;
      volumeBase += fill.sizeAtoms;
      volumeQuote += (fill.sizeAtoms * fill.priceTicks) / TICKS_PER_UNIT;
      count += 1;
    }
  }
  return { high, low, volumeBase, volumeQuote, count };
}

export function tickerFromOperator(
  book: Book,
  receipts: ReadonlyArray<SequenceReceipt>,
  nowSeconds: bigint,
  windowSeconds: bigint = 86_400n,
): Ticker {
  if (windowSeconds <= 0n) throw new RangeError("Window must be positive");
  if (nowSeconds < 0n) throw new RangeError("Now must be non-negative");
  const { bid, ask } = topOfBook(book);
  const bestBid = bid ? bid.priceTicks : null;
  const bestAsk = ask ? ask.priceTicks : null;
  const mid = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2n : null;
  const spreadTicks = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
  const lastPrice = lastPriceFromReceipts(receipts);
  const { high, low, volumeBase, volumeQuote, count } = rangeFromReceipts(receipts, windowSeconds, nowSeconds);
  return {
    bestBidTicks: bestBid?.toString() ?? null,
    bestAskTicks: bestAsk?.toString() ?? null,
    midTicks: mid?.toString() ?? null,
    spreadTicks: spreadTicks?.toString() ?? null,
    lastPriceTicks: lastPrice?.toString() ?? null,
    highTicks24h: high?.toString() ?? null,
    lowTicks24h: low?.toString() ?? null,
    volumeBase24h: volumeBase.toString(),
    volumeQuote24h: volumeQuote.toString(),
    tradeCount24h: count,
    sequence: book.seq,
    generatedAt: nowSeconds,
  };
}

export function depthFromBook(book: Book, levels: number, nowSeconds: bigint): DepthSnapshot {
  if (levels < 0) throw new RangeError("Levels must be non-negative");
  if (nowSeconds < 0n) throw new RangeError("Now must be non-negative");
  const aggregate = (orders: ReadonlyArray<RestingOrder>, descending: boolean): DepthLevel[] => {
    const buckets = new Map<bigint, { size: bigint; count: number }>();
    for (const order of orders) {
      const existing = buckets.get(order.priceTicks);
      if (existing) {
        existing.size += order.remainingAtoms;
        existing.count += 1;
      } else {
        buckets.set(order.priceTicks, { size: order.remainingAtoms, count: 1 });
      }
    }
    const sortedKeys = [...buckets.keys()].sort((a, b) => (descending ? (a > b ? -1 : a < b ? 1 : 0) : (a < b ? -1 : a > b ? 1 : 0)));
    const out: DepthLevel[] = [];
    for (const priceTicks of sortedKeys.slice(0, levels)) {
      const agg = buckets.get(priceTicks);
      if (!agg) continue;
      out.push({ priceTicks: priceTicks.toString(), sizeAtoms: agg.size.toString(), orderCount: agg.count });
    }
    return out;
  };
  return {
    bids: aggregate(book.bids, true),
    asks: aggregate(book.asks, false),
    sequence: book.seq,
    generatedAt: nowSeconds,
  };
}

export function tradesFromReceipts(
  receipts: ReadonlyArray<SequenceReceipt>,
  limit: number,
  nowSeconds: bigint,
): TradeSnapshot {
  if (limit < 0) throw new RangeError("Limit must be non-negative");
  if (nowSeconds < 0n) throw new RangeError("Now must be non-negative");
  const trades: PublicTrade[] = [];
  for (let i = receipts.length - 1; i >= 0; i--) {
    const receipt = receipts[i];
    if (!receipt) continue;
    for (const fill of receipt.fills) {
      trades.push({
        receiptSequence: receipt.sequence,
        side: fill.takerSide,
        priceTicks: fill.priceTicks.toString(),
        sizeAtoms: fill.sizeAtoms.toString(),
        makerId: fill.makerId,
        observedAt: nowSeconds,
      });
      if (trades.length >= limit) break;
    }
    if (trades.length >= limit) break;
  }
  return { trades, count: trades.length, generatedAt: nowSeconds };
}

export function marketsFromOperator(
  baseAsset: string | null,
  quoteAssets: ReadonlyArray<string> | ReadonlySet<string>,
  book: Book,
): MarketDescriptor {
  const assets = Array.isArray(quoteAssets) ? quoteAssets : [...quoteAssets];
  return {
    baseAsset,
    quoteAssets: assets,
    lastTicks: book.lastTicks.toString(),
    sequence: book.seq,
  };
}

export function topFills(receipts: ReadonlyArray<SequenceReceipt>, limit: number): ReadonlyArray<Fill> {
  if (limit < 0) throw new RangeError("Limit must be non-negative");
  const out: Fill[] = [];
  for (let i = receipts.length - 1; i >= 0; i--) {
    const receipt = receipts[i];
    if (!receipt) continue;
    for (const fill of receipt.fills) {
      out.push(fill);
      if (out.length >= limit) return out;
    }
  }
  return out;
}
