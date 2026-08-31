import type { Metadata } from "next";

import { TradingTerminal } from "@/components/trading-terminal";
import type { MarketId } from "@/lib/market-data";
import { isFeedStatus } from "@/lib/market-state";

export const metadata: Metadata = {
  title: "Protocol preview",
  description: "Explore no-value Phlebas native settlement and legacy pZEC simulations.",
};

type TradeView = "trade" | "settlement" | "liquidity" | "bridge" | "architecture";

function isTradeView(value: string | undefined): value is TradeView {
  return value === "trade"
    || value === "settlement"
    || value === "liquidity"
    || value === "bridge"
    || value === "architecture";
}

function isMarketId(value: string | undefined): value is MarketId {
  return value === "ZEC/USDC" || value === "ZEC/USDT";
}

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[]; market?: string | string[]; feed?: string | string[] }>;
}) {
  const params = await searchParams;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  const market = Array.isArray(params.market) ? params.market[0] : params.market;
  const feed = Array.isArray(params.feed) ? params.feed[0] : params.feed;
  return (
    <TradingTerminal
      initialView={isTradeView(view) ? view : "trade"}
      initialMarket={isMarketId(market) ? market : "ZEC/USDC"}
      initialFeed={isFeedStatus(feed) ? feed : "illustrative"}
    />
  );
}
