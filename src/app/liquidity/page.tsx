import type { Metadata } from "next";

import { TradingTerminal } from "@/components/trading-terminal";
import { parseAccessDemo } from "@/lib/access-demo";
import type { MarketId } from "@/lib/market-data";
import { isEducationForceQuery } from "@/lib/preview-education";

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
  searchParams: Promise<{
    market?: string | string[];
    access?: string | string[];
    education?: string | string[];
  }>;
}) {
  const params = await searchParams;
  const market = Array.isArray(params.market) ? params.market[0] : params.market;
  const access = Array.isArray(params.access) ? params.access[0] : params.access;
  const education = Array.isArray(params.education) ? params.education[0] : params.education;

  return (
    <TradingTerminal
      initialView="liquidity"
      initialMarket={isMarketId(market) ? market : "ZEC/USDC"}
      initialAccess={parseAccessDemo(access)}
      forceEducation={isEducationForceQuery(education)}
    />
  );
}
