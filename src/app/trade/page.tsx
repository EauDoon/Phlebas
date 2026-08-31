import type { Metadata } from "next";

import { TradingTerminal } from "@/components/trading-terminal";
import { parseAccessDemo } from "@/lib/access-demo";
import type { MarketId } from "@/lib/market-data";
import { isFeedStatus } from "@/lib/market-state";
import { isEducationForceQuery } from "@/lib/preview-education";

export const metadata: Metadata = {
  title: "Trading simulation",
  description: "Explore the no-value Phlebas ZEC order-book and liquidity simulation.",
};

type TradeView = "trade" | "liquidity" | "bridge" | "architecture";

function isTradeView(value: string | undefined): value is TradeView {
  return value === "trade" || value === "liquidity" || value === "bridge" || value === "architecture";
}

function isMarketId(value: string | undefined): value is MarketId {
  return value === "ZEC/USDC" || value === "ZEC/USDT";
}

export default async function TradePage({
  searchParams,
}: {
  searchParams: Promise<{
    view?: string | string[];
    market?: string | string[];
    feed?: string | string[];
    journey?: string | string[];
    access?: string | string[];
    education?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  const market = Array.isArray(params.market) ? params.market[0] : params.market;
  const feed = Array.isArray(params.feed) ? params.feed[0] : params.feed;
  const journey = Array.isArray(params.journey) ? params.journey[0] : params.journey;
  const access = Array.isArray(params.access) ? params.access[0] : params.access;
  const education = Array.isArray(params.education) ? params.education[0] : params.education;
  return (
    <TradingTerminal
      initialView={isTradeView(view) ? view : "trade"}
      initialMarket={isMarketId(market) ? market : "ZEC/USDC"}
      initialFeed={isFeedStatus(feed) ? feed : "illustrative"}
      initialBridgeJourney={journey === "withdrawal" ? "withdrawal" : "deposit"}
      initialAccess={parseAccessDemo(access)}
      forceEducation={isEducationForceQuery(education)}
    />
  );
}
