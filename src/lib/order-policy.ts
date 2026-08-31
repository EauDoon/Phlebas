import type { TypedOrderIntent } from "./eip712-order.ts";
import {
  MAX_ORDER_FEE_BPS,
  UINT64_MAX,
  UINT256_MAX,
  normalizeHex32,
  type Hex32,
} from "./order-domain.ts";

export const VENUE_CLOB = 1;
export const VENUE_AMM = 2;
export const KNOWN_VENUES = VENUE_CLOB | VENUE_AMM;
const ZERO_BYTES32 = `0x${"00".repeat(32)}`;

export type OrderPair = Readonly<{
  baseChainId: Hex32;
  baseAssetId: Hex32;
  quoteChainId: Hex32;
  quoteAssetId: Hex32;
}>;

export type OrderPolicyContext = Readonly<{
  nowSeconds: bigint;
  activeAccountEpoch: bigint;
  pair: OrderPair;
  settlementAdapterId: Hex32;
  maximumLifetimeSeconds?: bigint;
  requireClob?: boolean;
}>;

function isSamePair(order: TypedOrderIntent, pair: OrderPair): boolean {
  try {
    return normalizeHex32(order.baseChainId, "Base chain ID") === normalizeHex32(pair.baseChainId, "Allowed base chain ID")
      && normalizeHex32(order.baseAssetId, "Base asset ID") === normalizeHex32(pair.baseAssetId, "Allowed base asset ID")
      && normalizeHex32(order.quoteChainId, "Quote chain ID") === normalizeHex32(pair.quoteChainId, "Allowed quote chain ID")
      && normalizeHex32(order.quoteAssetId, "Quote asset ID") === normalizeHex32(pair.quoteAssetId, "Allowed quote asset ID");
  } catch {
    return false;
  }
}

export function orderPolicyErrors(order: TypedOrderIntent, context: OrderPolicyContext): string[] {
  const errors: string[] = [];
  const validBaseAmount = typeof order.baseAmountAtoms === "bigint" && order.baseAmountAtoms > 0n && order.baseAmountAtoms <= UINT256_MAX;
  const validLimitPrice = typeof order.limitPriceTicks === "bigint" && order.limitPriceTicks > 0n && order.limitPriceTicks <= UINT256_MAX;
  const validNonce = typeof order.nonce === "bigint" && order.nonce >= 0n && order.nonce <= UINT64_MAX;
  const validOrderEpoch = typeof order.accountEpoch === "bigint" && order.accountEpoch >= 0n && order.accountEpoch <= UINT64_MAX;
  const validExpiry = typeof order.expiry === "bigint" && order.expiry >= 0n && order.expiry <= UINT64_MAX;
  const validNow = typeof context.nowSeconds === "bigint" && context.nowSeconds >= 0n && context.nowSeconds <= UINT64_MAX;
  const validActiveEpoch = typeof context.activeAccountEpoch === "bigint"
    && context.activeAccountEpoch >= 0n && context.activeAccountEpoch <= UINT64_MAX;
  if (!validBaseAmount) errors.push("Base amount must be a positive uint256 bigint");
  if (!validLimitPrice) errors.push("Limit price must be a positive uint256 bigint");
  if (!validNonce) errors.push("Nonce must be a bigint that fits uint64");
  if (!validOrderEpoch) errors.push("Account epoch must be a bigint that fits uint64");
  if (!validExpiry || !validNow || order.expiry <= context.nowSeconds) errors.push("Order must have a future uint64 bigint expiry");
  if (!validActiveEpoch) errors.push("Active account epoch must be a bigint that fits uint64");
  if (validOrderEpoch && validActiveEpoch && order.accountEpoch !== context.activeAccountEpoch) errors.push("Order account epoch is not active");
  if (typeof order.maximumFeeBps !== "bigint" || order.maximumFeeBps < 0n || order.maximumFeeBps > MAX_ORDER_FEE_BPS) {
    errors.push("Order fee cap exceeds 30 basis points or is not a bigint");
  }
  if (!Number.isInteger(order.allowedVenues) || order.allowedVenues <= 0 || order.allowedVenues > 0xff
    || (order.allowedVenues & ~KNOWN_VENUES) !== 0) errors.push("Allowed venues contain an unknown, fractional, or empty mask");
  if (Number.isInteger(order.allowedVenues) && (context.requireClob ?? true)
    && (order.allowedVenues & VENUE_CLOB) === 0) errors.push("Order does not authorize the CLOB venue");
  if (order.side !== 0 && order.side !== 1) errors.push("Order side is invalid");
  if (order.timeInForce !== 0 && order.timeInForce !== 1 && order.timeInForce !== 2) errors.push("Time in force is invalid");
  if (!isSamePair(order, context.pair)) errors.push("Order asset-chain pair is not allowed");
  try {
    if (normalizeHex32(order.baseChainId, "Base chain ID") === normalizeHex32(order.quoteChainId, "Quote chain ID")
      && normalizeHex32(order.baseAssetId, "Base asset ID") === normalizeHex32(order.quoteAssetId, "Quote asset ID")) {
      errors.push("Base and quote assets must differ");
    }
  } catch {
    // The exact field validation below records the actionable error.
  }
  try {
    if (normalizeHex32(order.settlementAdapterId, "Settlement adapter ID")
      !== normalizeHex32(context.settlementAdapterId, "Allowed settlement adapter ID")) errors.push("Settlement adapter is not allowed");
  } catch {
    errors.push("Settlement adapter is not allowed");
  }

  for (const [label, value] of [
    ["Maker account ID", order.makerAccountId],
    ["Authorized signer ID", order.authorizedSignerId],
    ["Recipient account ID", order.recipientAccountId],
    ["Base chain ID", order.baseChainId],
    ["Base asset ID", order.baseAssetId],
    ["Quote chain ID", order.quoteChainId],
    ["Quote asset ID", order.quoteAssetId],
    ["Salt", order.salt],
    ["Settlement adapter ID", order.settlementAdapterId],
  ] as const) {
    try {
      if (normalizeHex32(value, label) === ZERO_BYTES32) errors.push(`${label} cannot be zero`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${label} is invalid`);
    }
  }

  if (context.maximumLifetimeSeconds !== undefined) {
    if (typeof context.maximumLifetimeSeconds !== "bigint" || context.maximumLifetimeSeconds <= 0n
      || context.maximumLifetimeSeconds > UINT64_MAX) errors.push("Maximum lifetime must be a positive uint64 bigint");
    else if (validExpiry && validNow && order.expiry > context.nowSeconds + context.maximumLifetimeSeconds) {
      errors.push("Order expiry exceeds the maximum lifetime");
    }
  }
  return errors;
}

export function assertOrderPolicy(order: TypedOrderIntent, context: OrderPolicyContext): void {
  const errors = orderPolicyErrors(order, context);
  if (errors.length > 0) throw new Error(errors.join("; "));
}
