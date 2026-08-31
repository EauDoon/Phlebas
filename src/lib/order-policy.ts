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
  return order.baseChainId === pair.baseChainId
    && order.baseAssetId === pair.baseAssetId
    && order.quoteChainId === pair.quoteChainId
    && order.quoteAssetId === pair.quoteAssetId;
}

export function orderPolicyErrors(order: TypedOrderIntent, context: OrderPolicyContext): string[] {
  const errors: string[] = [];
  if (order.baseAmountAtoms <= 0n || order.baseAmountAtoms > UINT256_MAX) errors.push("Base amount must be a positive uint256");
  if (order.limitPriceTicks <= 0n || order.limitPriceTicks > UINT256_MAX) errors.push("Limit price must be a positive uint256");
  if (order.nonce < 0n || order.nonce > UINT64_MAX) errors.push("Nonce must fit uint64");
  if (order.accountEpoch < 0n || order.accountEpoch > UINT64_MAX) errors.push("Account epoch must fit uint64");
  if (order.expiry <= context.nowSeconds || order.expiry > UINT64_MAX) errors.push("Order must have a future uint64 expiry");
  if (order.accountEpoch !== context.activeAccountEpoch) errors.push("Order account epoch is not active");
  if (order.maximumFeeBps < 0n || order.maximumFeeBps > MAX_ORDER_FEE_BPS) errors.push("Order fee cap exceeds 30 basis points");
  if (!Number.isInteger(order.allowedVenues) || order.allowedVenues <= 0 || order.allowedVenues > 0xff
    || (order.allowedVenues & ~KNOWN_VENUES) !== 0) errors.push("Allowed venues contain an unknown, fractional, or empty mask");
  if (Number.isInteger(order.allowedVenues) && (context.requireClob ?? true)
    && (order.allowedVenues & VENUE_CLOB) === 0) errors.push("Order does not authorize the CLOB venue");
  if (order.side !== 0 && order.side !== 1) errors.push("Order side is invalid");
  if (order.timeInForce !== 0 && order.timeInForce !== 1 && order.timeInForce !== 2) errors.push("Time in force is invalid");
  if (!isSamePair(order, context.pair)) errors.push("Order asset-chain pair is not allowed");
  if (order.baseChainId === order.quoteChainId && order.baseAssetId === order.quoteAssetId) errors.push("Base and quote assets must differ");
  if (order.settlementAdapterId !== context.settlementAdapterId) errors.push("Settlement adapter is not allowed");

  for (const [label, value] of [
    ["Maker account ID", order.makerAccountId],
    ["Authorized signer ID", order.authorizedSignerId],
    ["Recipient account ID", order.recipientAccountId],
    ["Salt", order.salt],
  ] as const) {
    try {
      if (normalizeHex32(value, label) === ZERO_BYTES32) errors.push(`${label} cannot be zero`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : `${label} is invalid`);
    }
  }

  if (context.maximumLifetimeSeconds !== undefined) {
    if (context.maximumLifetimeSeconds <= 0n) errors.push("Maximum lifetime must be positive");
    else if (order.expiry > context.nowSeconds + context.maximumLifetimeSeconds) errors.push("Order expiry exceeds the maximum lifetime");
  }
  return errors;
}

export function assertOrderPolicy(order: TypedOrderIntent, context: OrderPolicyContext): void {
  const errors = orderPolicyErrors(order, context);
  if (errors.length > 0) throw new Error(errors.join("; "));
}
