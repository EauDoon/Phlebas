import type { Metadata } from "next";

import { SimulationLoading } from "@/components/simulation-loading";
import { TradingTerminal } from "@/components/trading-terminal";
import { parseAccessDemo } from "@/lib/access-demo";
import { isLoadingForceQuery } from "@/lib/loading-demo";
import type { MarketId } from "@/lib/market-data";
import { isFeedStatus } from "@/lib/market-state";
import { isEducationForceQuery } from "@/lib/preview-education";
import { isRenderFailureQuery, RENDER_FAILURE_MESSAGE } from "@/lib/render-demo";
import { isTerminalView } from "@/lib/terminal-views";
import { isIncidentDemoQuery } from "@/lib/gateway-incidents";

export const metadata: Metadata = {
  title: "Trading simulation",
  description: "Explore the no-value Phlebas ZEC order-book and liquidity simulation.",
};

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
    error?: string | string[];
    loading?: string | string[];
    demo?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const view = Array.isArray(params.view) ? params.view[0] : params.view;
  const market = Array.isArray(params.market) ? params.market[0] : params.market;
  const feed = Array.isArray(params.feed) ? params.feed[0] : params.feed;
  const journey = Array.isArray(params.journey) ? params.journey[0] : params.journey;
  const access = Array.isArray(params.access) ? params.access[0] : params.access;
  const education = Array.isArray(params.education) ? params.education[0] : params.education;
  const error = Array.isArray(params.error) ? params.error[0] : params.error;
  const loading = Array.isArray(params.loading) ? params.loading[0] : params.loading;
  const demo = Array.isArray(params.demo) ? params.demo[0] : params.demo;
  if (isRenderFailureQuery(error)) {
    throw new Error(RENDER_FAILURE_MESSAGE);
  }
  if (isLoadingForceQuery(loading)) {
    return <SimulationLoading />;
  }
  return (
    <TradingTerminal
      initialView={isTerminalView(view) ? view : "trade"}
      initialMarket={isMarketId(market) ? market : "ZEC/USDC"}
      initialFeed={isFeedStatus(feed) ? feed : "illustrative"}
      initialBridgeJourney={journey === "withdrawal" ? "withdrawal" : "deposit"}
      initialAccess={parseAccessDemo(access)}
      forceEducation={isEducationForceQuery(education)}
      highlightIncidents={isIncidentDemoQuery(demo)}
    />
  );
}
