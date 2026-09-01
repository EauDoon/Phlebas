import type { MarketId } from "./market-data.ts";

export const NATIVE_MATCHER_UNAVAILABLE_HEADING = "Native matcher submission unavailable";
export const NATIVE_MATCHER_REVIEW_HEADING = "Review native matcher order";
export const NATIVE_MATCHER_DISABLED_COPY = "Native matcher submission is unavailable. The ZEC/USDC deployment manifest is undeployed and submission is disabled. No wallet connection, signature, token approval, or transaction will be requested.";
export const NATIVE_MATCHER_USDT_DISABLED_COPY = "Native matcher submission is unavailable. The ZEC/USDT deployment manifest is undeployed and submission is disabled. No wallet connection, signature, token approval, or transaction will be requested.";
export const NATIVE_MATCHER_MARKET_MISMATCH_COPY = "Native matcher submission is unavailable. The selected market does not match the supplied deployment manifest. No wallet connection, signature, token approval, or transaction will be requested.";
export const NATIVE_MATCHER_WORKFLOW_UNAVAILABLE_COPY = "Native matcher submission is unavailable in this terminal build. No wallet connection, signature, token approval, or transaction will be requested.";
export const NATIVE_MATCHER_WORKFLOW_READY_COPY = "Review the exact native buy intent before requesting its Ethereum Mainnet order signature. This workflow never requests token approval or transaction submission.";
export const NATIVE_MATCHER_SELL_UNSUPPORTED_COPY = "Buy intents only. ZEC sell-side submission remains unavailable because no Zcash wallet authorization format is integrated.";

export type NativeMatcherOrderActionState = Readonly<{
  kind: "manifest-disabled" | "manifest-mismatch" | "workflow-unavailable" | "workflow-ready";
  heading: typeof NATIVE_MATCHER_UNAVAILABLE_HEADING | typeof NATIVE_MATCHER_REVIEW_HEADING;
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
  configurationHash: string;
  marketId: MarketId;
  side: "buy";
  priceTicks: bigint;
  sizeAtoms: bigint;
  expiryUnix: bigint;
  zcashRecipient: string;
}>;

export type NativeMatcherOrderConfirmationOutcome =
  | Readonly<{
    kind: "confirmed";
    verified: true;
    requestId: string;
    configurationHash: string;
    receiptSequence: bigint;
    subjectHash: string;
  }>
  | Readonly<{
    kind: "rejected";
    requestId: string;
    configurationHash: string;
    status: number;
  }>
  | Readonly<{
    kind: "receipt-unknown";
    requestId: string;
    configurationHash: string;
  }>;

/**
 * Reserved client-side boundary for a future enabled matcher flow. The
 * standalone disabled surface never invokes this interface.
 */
export type NativeMatcherOrderWorkflow = Readonly<{
  review(input: NativeMatcherOrderReviewInput): Promise<NativeMatcherOrderReview>;
  confirm(review: NativeMatcherOrderReview): Promise<NativeMatcherOrderConfirmationOutcome>;
}>;

export type NativeMatcherDeploymentState = Readonly<{
  enabled: boolean;
  deployed: boolean;
  submissionEnabled: boolean;
  configured: boolean;
  state: "disabled" | "enabled";
  configurationHash: string | null;
  orderDomain: unknown | null;
  expectedMatcher: unknown | null;
  manifest: Readonly<{
    market: Readonly<{
      id: MarketId;
      settlementPair: "ZEC-USDC" | "ZEC-USDT";
    }>;
  }>;
}>;

function disabledCopy(marketId: MarketId): string {
  return marketId === "ZEC/USDT" ? NATIVE_MATCHER_USDT_DISABLED_COPY : NATIVE_MATCHER_DISABLED_COPY;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

function exactRecord(value: unknown, keys: readonly string[], label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
  const record = value as Record<string, unknown>;
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} contains missing or unsupported fields`);
  }
  return record;
}

function hex32(value: unknown, label: string): string {
  if (typeof value !== "string" || !/^0x[0-9a-f]{64}$/.test(value)) {
    throw new TypeError(`${label} must be 32 lowercase hexadecimal bytes`);
  }
  return value;
}

function requestId(value: unknown): string {
  if (typeof value !== "string" || !/^order-[0-9a-f]{64}$/.test(value)) {
    throw new TypeError("Native matcher request ID must bind one lowercase order hash");
  }
  return value;
}

export function bindNativeMatcherOrderReview(
  input: NativeMatcherOrderReviewInput,
  value: unknown,
  deployment: NativeMatcherDeploymentState,
): NativeMatcherOrderReview {
  const review = exactRecord(value, [
    "requestId", "configurationHash", "marketId", "side", "priceTicks",
    "sizeAtoms", "expiryUnix", "zcashRecipient",
  ], "Native matcher order review");
  const configurationHash = hex32(deployment.configurationHash, "Native matcher deployment configuration hash");
  if (review.configurationHash !== configurationHash
    || review.marketId !== input.marketId
    || review.side !== input.side
    || review.priceTicks !== input.priceTicks
    || review.sizeAtoms !== input.sizeAtoms
    || review.expiryUnix !== input.expiryUnix
    || review.zcashRecipient !== input.zcashRecipient
    || typeof review.priceTicks !== "bigint" || review.priceTicks <= 0n
    || typeof review.sizeAtoms !== "bigint" || review.sizeAtoms <= 0n
    || typeof review.expiryUnix !== "bigint" || review.expiryUnix < 0n) {
    throw new Error("Native matcher review does not bind the exact requested order terms");
  }
  return deepFreeze({
    requestId: requestId(review.requestId),
    configurationHash,
    marketId: input.marketId,
    side: "buy",
    priceTicks: input.priceTicks,
    sizeAtoms: input.sizeAtoms,
    expiryUnix: input.expiryUnix,
    zcashRecipient: input.zcashRecipient,
  });
}

export function bindNativeMatcherConfirmationOutcome(
  review: NativeMatcherOrderReview,
  value: unknown,
): NativeMatcherOrderConfirmationOutcome {
  const candidate = value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
  if (!candidate || (candidate.kind !== "confirmed"
    && candidate.kind !== "rejected"
    && candidate.kind !== "receipt-unknown")) {
    throw new TypeError("Native matcher confirmation outcome is unsupported");
  }
  const binding = (record: Record<string, unknown>) => {
    if (record.requestId !== review.requestId || record.configurationHash !== review.configurationHash) {
      throw new Error("Native matcher confirmation does not bind the reviewed request");
    }
  };
  if (candidate.kind === "confirmed") {
    const confirmed = exactRecord(candidate, [
      "kind", "verified", "requestId", "configurationHash", "receiptSequence", "subjectHash",
    ], "Confirmed native matcher outcome");
    binding(confirmed);
    if (confirmed.verified !== true
      || typeof confirmed.receiptSequence !== "bigint" || confirmed.receiptSequence <= 0n) {
      throw new Error("Native matcher acceptance requires a verified positive-sequence receipt");
    }
    const subjectHash = hex32(confirmed.subjectHash, "Native matcher receipt subject hash");
    if (subjectHash !== `0x${review.requestId.slice("order-".length)}`) {
      throw new Error("Native matcher receipt subject does not bind the reviewed order hash");
    }
    return deepFreeze({
      kind: "confirmed",
      verified: true,
      requestId: review.requestId,
      configurationHash: review.configurationHash,
      receiptSequence: confirmed.receiptSequence,
      subjectHash,
    });
  }
  if (candidate.kind === "rejected") {
    const rejected = exactRecord(candidate, ["kind", "requestId", "configurationHash", "status"], "Rejected native matcher outcome");
    binding(rejected);
    if (typeof rejected.status !== "number" || !Number.isSafeInteger(rejected.status)
      || rejected.status < 400 || rejected.status >= 500) {
      throw new Error("Native matcher rejection requires an exact 4xx status");
    }
    return deepFreeze({
      kind: "rejected",
      requestId: review.requestId,
      configurationHash: review.configurationHash,
      status: rejected.status,
    });
  }
  const unknown = exactRecord(candidate, ["kind", "requestId", "configurationHash"], "Unknown native matcher receipt outcome");
  binding(unknown);
  return deepFreeze({
    kind: "receipt-unknown",
    requestId: review.requestId,
    configurationHash: review.configurationHash,
  });
}

export function nativeMatcherOrderActionState(
  marketId: MarketId,
  deployment: NativeMatcherDeploymentState,
  workflowAvailable = false,
): NativeMatcherOrderActionState {
  const identity = deployment.manifest.market;
  const exactIdentity = (identity.id === "ZEC/USDC" && identity.settlementPair === "ZEC-USDC")
    || (identity.id === "ZEC/USDT" && identity.settlementPair === "ZEC-USDT");
  if (!exactIdentity || marketId !== identity.id) {
    return {
      kind: "manifest-mismatch",
      heading: NATIVE_MATCHER_UNAVAILABLE_HEADING,
      message: NATIVE_MATCHER_MARKET_MISMATCH_COPY,
      sellNotice: NATIVE_MATCHER_SELL_UNSUPPORTED_COPY,
    };
  }

  if (!deployment.enabled
    || !deployment.deployed
    || !deployment.submissionEnabled
    || !deployment.configured
    || deployment.state !== "enabled"
    || deployment.configurationHash === null
    || deployment.orderDomain === null
    || deployment.expectedMatcher === null) {
    return {
      kind: "manifest-disabled",
      heading: NATIVE_MATCHER_UNAVAILABLE_HEADING,
      message: deployment.deployed || deployment.submissionEnabled
        ? `Native matcher submission is unavailable. The ${marketId} deployment manifest does not permit submission. No wallet connection, signature, token approval, or transaction will be requested.`
        : disabledCopy(marketId),
      sellNotice: NATIVE_MATCHER_SELL_UNSUPPORTED_COPY,
    };
  }

  if (workflowAvailable) {
    return {
      kind: "workflow-ready",
      heading: NATIVE_MATCHER_REVIEW_HEADING,
      message: NATIVE_MATCHER_WORKFLOW_READY_COPY,
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
