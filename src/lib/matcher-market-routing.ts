import type { AtomicSwapPair } from "./atomic-swap-plan.ts";
import type { MarketId } from "./market-data.ts";
import {
  NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT,
  type NativeZecUsdcMatcherDeploymentState,
} from "./native-zec-usdc-matcher-manifest.ts";
import {
  NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT,
  type NativeZecUsdtMatcherDeploymentState,
} from "./native-zec-usdt-matcher-manifest.ts";

export const MATCHER_MARKET_QUERY_KEY = "market" as const;

export type MatcherMarketDeployment =
  | NativeZecUsdcMatcherDeploymentState
  | NativeZecUsdtMatcherDeploymentState;

export type MatcherMarketSelection = Readonly<{
  marketId: MarketId;
  deployment: MatcherMarketDeployment;
}>;

export function matcherDeploymentForMarket(value: string | null | undefined): MatcherMarketDeployment | null {
  if (value === "ZEC/USDC") return NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT;
  if (value === "ZEC/USDT") return NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT;
  return null;
}

export function exactMatcherMarketSelection(
  search: URLSearchParams,
  additionalKey?: "account" | "action",
): MatcherMarketSelection | null {
  if (search.getAll(MATCHER_MARKET_QUERY_KEY).length !== 1) return null;
  for (const key of search.keys()) {
    if (key !== MATCHER_MARKET_QUERY_KEY && key !== additionalKey) return null;
  }
  if (additionalKey && search.getAll(additionalKey).length > 1) return null;
  const deployment = matcherDeploymentForMarket(search.get(MATCHER_MARKET_QUERY_KEY));
  if (!deployment) return null;
  return Object.freeze({ marketId: deployment.manifest.market.id, deployment });
}

export function matcherApiPathForMarket(marketId: MarketId): string {
  const deployment = matcherDeploymentForMarket(marketId);
  if (!deployment) throw new TypeError("Matcher market is unsupported");
  return `/api/matcher?${MATCHER_MARKET_QUERY_KEY}=${encodeURIComponent(marketId)}`;
}

function sameAsset(left: AtomicSwapPair["base"], right: AtomicSwapPair["base"]): boolean {
  return left.network === right.network
    && left.asset === right.asset
    && left.environment === right.environment
    && left.decimals === right.decimals;
}

export function matcherMarketIdForIdentity(market: AtomicSwapPair): MarketId {
  for (const deployment of [NATIVE_ZEC_USDC_MATCHER_DEPLOYMENT, NATIVE_ZEC_USDT_MATCHER_DEPLOYMENT]) {
    if (sameAsset(market.base, deployment.market.base) && sameAsset(market.quote, deployment.market.quote)) {
      return deployment.manifest.market.id;
    }
  }
  throw new Error("Matcher identity is not an exact approved mainnet market");
}
