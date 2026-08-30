export type MarketId = "ZEC/USDC" | "ZEC/USDT";
export type ChartRange = "1H" | "4H" | "1D";

export type Market = {
  id: MarketId;
  settlementPair: "pZEC-USDC" | "pZEC-USDT0";
  quote: "USDC" | "USDT0";
  last: number;
  change: number;
  high: number;
  low: number;
  volume: string;
};

export type BookLevel = {
  price: number;
  size: number;
  total: number;
};

export type RecentTrade = {
  price: number;
  size: number;
  side: "buy" | "sell";
  time: string;
};

export const markets: Record<MarketId, Market> = {
  "ZEC/USDC": {
    id: "ZEC/USDC",
    settlementPair: "pZEC-USDC",
    quote: "USDC",
    last: 52.84,
    change: 5.85,
    high: 52.84,
    low: 49.92,
    volume: "$1.84M",
  },
  "ZEC/USDT": {
    id: "ZEC/USDT",
    settlementPair: "pZEC-USDT0",
    quote: "USDT0",
    last: 52.79,
    change: 5.83,
    high: 52.79,
    low: 49.88,
    volume: "$1.12M",
  },
};

export const chartSeries: Record<MarketId, Record<ChartRange, number[]>> = {
  "ZEC/USDC": {
    "1H": [51.82, 51.68, 51.93, 52.06, 51.97, 52.18, 52.11, 52.46, 52.38, 52.61, 52.49, 52.84],
    "4H": [50.72, 50.96, 50.81, 51.14, 51.47, 51.35, 51.88, 52.22, 52.05, 52.41, 52.66, 52.84],
    "1D": [49.92, 50.21, 50.04, 50.68, 50.44, 51.16, 51.02, 51.74, 52.08, 51.91, 52.42, 52.84],
  },
  "ZEC/USDT": {
    "1H": [51.77, 51.64, 51.89, 52.01, 51.93, 52.14, 52.08, 52.41, 52.33, 52.56, 52.44, 52.79],
    "4H": [50.68, 50.91, 50.76, 51.09, 51.42, 51.3, 51.83, 52.17, 52.0, 52.36, 52.61, 52.79],
    "1D": [49.88, 50.17, 50.0, 50.63, 50.4, 51.11, 50.98, 51.69, 52.03, 51.86, 52.37, 52.79],
  },
};

const usdcAsks = [53.18, 53.12, 53.08, 53.02, 52.97, 52.91];
const usdcBids = [52.78, 52.73, 52.69, 52.63, 52.57, 52.51];

function makeLevels(prices: number[], seed: number, accumulateFrom: "start" | "end"): BookLevel[] {
  const levels = prices.map((price, index) => {
    const size = Number((7.3 + ((index + seed) * 4.17) % 21).toFixed(2));
    return { price, size, total: 0 };
  });
  const indexes = [...levels.keys()];
  if (accumulateFrom === "end") indexes.reverse();

  let total = 0;
  for (const index of indexes) {
    total += levels[index].size;
    levels[index].total = Number(total.toFixed(2));
  }
  return levels;
}

export const books: Record<MarketId, { asks: BookLevel[]; bids: BookLevel[] }> = {
  "ZEC/USDC": {
    asks: makeLevels(usdcAsks, 2, "end"),
    bids: makeLevels(usdcBids, 5, "start"),
  },
  "ZEC/USDT": {
    asks: makeLevels(usdcAsks.map((price) => price - 0.05), 4, "end"),
    bids: makeLevels(usdcBids.map((price) => price - 0.05), 7, "start"),
  },
};

export const recentTrades: Record<MarketId, readonly RecentTrade[]> = {
  "ZEC/USDC": [
    { price: 52.84, size: 3.4, side: "buy", time: "14:32:08" },
    { price: 52.81, size: 8.12, side: "sell", time: "14:31:54" },
    { price: 52.82, size: 1.76, side: "buy", time: "14:31:41" },
    { price: 52.78, size: 12.05, side: "sell", time: "14:31:27" },
    { price: 52.8, size: 5.44, side: "buy", time: "14:31:12" },
  ],
  "ZEC/USDT": [
    { price: 52.79, size: 3.4, side: "buy", time: "14:32:08" },
    { price: 52.76, size: 8.12, side: "sell", time: "14:31:54" },
    { price: 52.77, size: 1.76, side: "buy", time: "14:31:41" },
    { price: 52.73, size: 12.05, side: "sell", time: "14:31:27" },
    { price: 52.75, size: 5.44, side: "buy", time: "14:31:12" },
  ],
};

export const pools = [
  {
    id: "pZEC/USDC",
    quote: "USDC",
    fee: "0.30%",
    tvl: "$842,410",
    volume: "$311,820",
    reserveZec: 7971.32,
    reserveQuote: 421205,
    reserveZecAtoms: 797_132_000000n,
    reserveQuoteAtoms: 421_205_000000n,
  },
  {
    id: "pZEC/USDT0",
    quote: "USDT0",
    fee: "0.30%",
    tvl: "$516,920",
    volume: "$188,460",
    reserveZec: 4896.00,
    reserveQuote: 258460,
    reserveZecAtoms: 489_600_000000n,
    reserveQuoteAtoms: 258_460_000000n,
  },
] as const;
