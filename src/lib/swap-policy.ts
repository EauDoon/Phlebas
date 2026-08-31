import { UINT64_MAX } from "./order-domain.ts";
import { validateSwapTerms, type SwapTermsV1 } from "./swap-domain.ts";

export type SwapTimingPolicy = Readonly<{
  minimumFundingWindowSeconds: bigint;
  minimumClaimWindowSeconds: bigint;
  minimumSafetyWindowSeconds: bigint;
}>;

export type SwapDeadlineStatus = Readonly<{
  authorizationOpen: boolean;
  zecFundingOpen: boolean;
  evmFundingOpen: boolean;
  evmClaimSafe: boolean;
  evmRefundEligible: boolean;
  zecRefundEligible: boolean;
}>;

function positiveUint64(value: bigint, label: string): bigint {
  if (typeof value !== "bigint") throw new TypeError(`${label} must be a bigint`);
  if (value <= 0n || value > UINT64_MAX) throw new RangeError(`${label} must be a positive uint64`);
  return value;
}

export function assertSwapTimingPolicy(terms: SwapTermsV1, policy: SwapTimingPolicy): SwapTermsV1 {
  const validated = validateSwapTerms(terms);
  const fundingWindow = positiveUint64(policy.minimumFundingWindowSeconds, "Minimum funding window");
  const claimWindow = positiveUint64(policy.minimumClaimWindowSeconds, "Minimum claim window");
  const safetyWindow = positiveUint64(policy.minimumSafetyWindowSeconds, "Minimum safety window");

  const ordered = [
    validated.authorizationDeadline,
    validated.zecFundBy,
    validated.evmFundBy,
    validated.evmClaimSafetyCutoff,
    validated.evmRefundTime,
    validated.zecRefundTime,
  ];
  if (ordered.some((deadline, index) => index > 0 && deadline <= ordered[index - 1])) {
    throw new RangeError("Swap deadlines must be strictly increasing");
  }
  if (validated.zecFundBy - validated.authorizationDeadline < fundingWindow) {
    throw new RangeError("ZEC funding window is below the policy minimum");
  }
  if (validated.evmFundBy - validated.zecFundBy < fundingWindow) {
    throw new RangeError("Second-leg funding window is below the policy minimum");
  }
  if (validated.evmRefundTime - validated.evmClaimSafetyCutoff < claimWindow) {
    throw new RangeError("EVM claim window is below the policy minimum");
  }
  if (validated.zecRefundTime - validated.evmRefundTime < safetyWindow) {
    throw new RangeError("Cross-chain safety window is below the policy minimum");
  }
  return validated;
}

export function swapDeadlineStatus(terms: SwapTermsV1, nowSeconds: bigint): SwapDeadlineStatus {
  if (typeof nowSeconds !== "bigint") throw new TypeError("Current time must be a bigint");
  if (nowSeconds < 0n || nowSeconds > UINT64_MAX) throw new RangeError("Current time must fit uint64");
  const validated = validateSwapTerms(terms);
  return {
    authorizationOpen: nowSeconds < validated.authorizationDeadline,
    zecFundingOpen: nowSeconds < validated.zecFundBy,
    evmFundingOpen: nowSeconds < validated.evmFundBy,
    evmClaimSafe: nowSeconds < validated.evmClaimSafetyCutoff,
    evmRefundEligible: nowSeconds >= validated.evmRefundTime,
    zecRefundEligible: nowSeconds >= validated.zecRefundTime,
  };
}
