import type { Metadata } from "next";

import { TradingTerminal } from "@/components/trading-terminal";
import type { MarketId } from "@/lib/market-data";

export const metadata: Metadata = {
  title: "Liquidity simulation",
  description: "Explore the no-value Phlebas pZEC liquidity simulation.",
};

function isMarketId(value: string | undefined): value is MarketId {
  return value === "ZEC/USDC" || value === "ZEC/USDT";
}

export default async function LiquidityPage({
  searchParams,
}: {
  searchParams: Promise<{ market?: string | string[] }>;
}) {
  const params = await searchParams;
  const market = Array.isArray(params.market) ? params.market[0] : params.market;

  return (
    <TradingTerminal
      initialView="liquidity"
      initialMarket={isMarketId(market) ? market : "ZEC/USDC"}
    />
  );
}
