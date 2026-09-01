import type { MarketId } from "./market-data.ts";

export const NATIVE_MATCHER_UNAVAILABLE_HEADING = "Native matcher submission unavailable";
export const NATIVE_MATCHER_DISABLED_COPY = "Native matcher submission is unavailable. The ZEC/USDC deployment manifest is undeployed and submission is disabled. No wallet connection, signature, token approval, or transaction will be requested.";
export const NATIVE_MATCHER_USDT_DISABLED_COPY = "Native matcher submission is unavailable. The ZEC/USDT deployment manifest is undeployed and submission is disabled. No wallet connection, signature, token approval, or transaction will be requested.";
export const NATIVE_MATCHER_MARKET_MISMATCH_COPY = "Native matcher submission is unavailable. The selected market does not match the supplied deployment manifest. No wallet connection, signature, token approval, or transaction will be requested.";
export const NATIVE_MATCHER_WORKFLOW_UNAVAILABLE_COPY = "Native matcher submission is unavailable in this terminal build. No wallet connection, signature, token approval, or transaction will be requested.";
export const NATIVE_MATCHER_SELL_UNSUPPORTED_COPY = "Buy intents only. ZEC sell-side submission remains unavailable because no Zcash wallet authorization format is integrated.";

export type NativeMatcherOrderActionState = Readonly<{
  kind: "manifest-disabled" | "manifest-mismatch" | "workflow-unavailable";
  heading: typeof NATIVE_MATCHER_UNAVAILABLE_HEADING;
  message: string;
  sellNotice: typeof NATIVE_MATCHER_SELL_UNSUPPORTED_COPY;
}>;

export type NativeMatcherOrderReviewInput = Readonly<{
  marketId: MarketId;
  side: "buy";
  priceTicks: bigint;
  sizeAtoms: bigint;
  expiryUnix: bigint;
  zcashRecipient: string;
}>;

export type NativeMatcherOrderReview = Readonly<{
  requestId: string;
}>;

/**
 * Reserved client-side boundary for a future enabled matcher flow. The
 * standalone disabled surface never invokes this interface.
 */
export type NativeMatcherOrderWorkflow = Readonly<{
  review(input: NativeMatcherOrderReviewInput): Promise<NativeMatcherOrderReview>;
  confirm(review: NativeMatcherOrderReview): Promise<void>;
}>;

export type NativeMatcherDeploymentState = Readonly<{
  enabled: boolean;
  deployed: boolean;
  submissionEnabled: boolean;
  manifest: Readonly<{
    market: Readonly<{ id: MarketId }>;
  }>;
}>;

function disabledCopy(marketId: MarketId): string {
  return marketId === "ZEC/USDT" ? NATIVE_MATCHER_USDT_DISABLED_COPY : NATIVE_MATCHER_DISABLED_COPY;
}

export function nativeMatcherOrderActionState(
  marketId: MarketId,
  deployment: NativeMatcherDeploymentState,
): NativeMatcherOrderActionState {
  if (marketId !== deployment.manifest.market.id) {
    return {
      kind: "manifest-mismatch",
      heading: NATIVE_MATCHER_UNAVAILABLE_HEADING,
      message: NATIVE_MATCHER_MARKET_MISMATCH_COPY,
      sellNotice: NATIVE_MATCHER_SELL_UNSUPPORTED_COPY,
    };
  }

  if (!deployment.enabled) {
    return {
      kind: "manifest-disabled",
      heading: NATIVE_MATCHER_UNAVAILABLE_HEADING,
      message: deployment.deployed || deployment.submissionEnabled
        ? `Native matcher submission is unavailable. The ${marketId} deployment manifest does not permit submission. No wallet connection, signature, token approval, or transaction will be requested.`
        : disabledCopy(marketId),
      sellNotice: NATIVE_MATCHER_SELL_UNSUPPORTED_COPY,
    };
  }

  return {
    kind: "workflow-unavailable",
    heading: NATIVE_MATCHER_UNAVAILABLE_HEADING,
    message: NATIVE_MATCHER_WORKFLOW_UNAVAILABLE_COPY,
    sellNotice: NATIVE_MATCHER_SELL_UNSUPPORTED_COPY,
  };
}
