import type { MarketId } from "./market-data.ts";

export const MARKET_IDS = ["ZEC/USDC", "ZEC/USDT"] as const satisfies readonly MarketId[];

export const MARKET_ID_LABELS: Record<MarketId, string> = {
  "ZEC/USDC": "ZEC / USDC",
  "ZEC/USDT": "ZEC / USDT",
};

export function isMarketId(value: string | undefined): value is MarketId {
  return MARKET_IDS.includes(value as MarketId);
}

export function nextMarketId(id: MarketId, delta: number): MarketId {
  const count = MARKET_IDS.length;
  const index = (MARKET_IDS.indexOf(id) + delta + count) % count;
  return MARKET_IDS[index];
}
