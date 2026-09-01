import type { MarketId } from "./market-data.ts";
import {
  NATIVE_ZEC_USDC_MARKET_ID,
  type NativeZecUsdcMatcherDeploymentState,
} from "./native-zec-usdc-matcher-manifest.ts";

export const NATIVE_MATCHER_UNAVAILABLE_HEADING = "Native matcher submission unavailable";
export const NATIVE_MATCHER_DISABLED_COPY = "Native matcher submission is unavailable. The ZEC/USDC deployment manifest is undeployed and submission is disabled. No wallet connection, signature, token approval, or transaction will be requested.";
export const NATIVE_MATCHER_UNSUPPORTED_MARKET_COPY = "Native matcher submission is unavailable for ZEC/USDT. No exact ZEC/USDT matcher manifest is approved. No wallet connection, signature, token approval, or transaction will be requested.";
export const NATIVE_MATCHER_WORKFLOW_UNAVAILABLE_COPY = "Native matcher submission is unavailable in this terminal build. No wallet connection, signature, token approval, or transaction will be requested.";
export const NATIVE_MATCHER_SELL_UNSUPPORTED_COPY = "Buy intents only. ZEC sell-side submission remains unavailable because no Zcash wallet authorization format is integrated.";

export type NativeMatcherOrderActionState = Readonly<{
  kind: "manifest-disabled" | "unsupported-market" | "workflow-unavailable";
  heading: typeof NATIVE_MATCHER_UNAVAILABLE_HEADING;
  message: string;
  sellNotice: typeof NATIVE_MATCHER_SELL_UNSUPPORTED_COPY;
}>;

export type NativeMatcherOrderReviewInput = Readonly<{
  marketId: typeof NATIVE_ZEC_USDC_MARKET_ID;
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

export function nativeMatcherOrderActionState(
  marketId: MarketId,
  deployment: NativeZecUsdcMatcherDeploymentState,
): NativeMatcherOrderActionState {
  if (marketId !== NATIVE_ZEC_USDC_MARKET_ID) {
    return {
      kind: "unsupported-market",
      heading: NATIVE_MATCHER_UNAVAILABLE_HEADING,
      message: NATIVE_MATCHER_UNSUPPORTED_MARKET_COPY,
      sellNotice: NATIVE_MATCHER_SELL_UNSUPPORTED_COPY,
    };
  }

  if (!deployment.enabled) {
    return {
      kind: "manifest-disabled",
      heading: NATIVE_MATCHER_UNAVAILABLE_HEADING,
      message: deployment.deployed || deployment.submissionEnabled
        ? "Native matcher submission is unavailable. The ZEC/USDC deployment manifest does not permit submission. No wallet connection, signature, token approval, or transaction will be requested."
        : NATIVE_MATCHER_DISABLED_COPY,
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
