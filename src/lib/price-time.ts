import type { TypedOrderIntent } from "./eip712-order.ts";
import { UINT64_MAX, normalizeHex32, type Hex32 } from "./order-domain.ts";

export type SequencedOrder = Readonly<{
  orderHash: Hex32;
  sequence: bigint;
  order: TypedOrderIntent;
  remainingBaseAtoms: bigint;
}>;

export type PlannedFill = Readonly<{
  makerOrderHash: Hex32;
  takerOrderHash: Hex32;
  makerSequence: bigint;
  executionPriceTicks: bigint;
  baseAmountAtoms: bigint;
}>;

export type MatchPlan = Readonly<{
  fills: readonly PlannedFill[];
  remainingBaseAtoms: bigint;
  status: "filled" | "partial" | "unfilled" | "fok-rejected";
}>;

function samePair(left: TypedOrderIntent, right: TypedOrderIntent): boolean {
  return left.baseChainId === right.baseChainId
    && left.baseAssetId === right.baseAssetId
    && left.quoteChainId === right.quoteChainId
    && left.quoteAssetId === right.quoteAssetId
    && left.settlementAdapterId === right.settlementAdapterId;
}

function crosses(taker: TypedOrderIntent, maker: TypedOrderIntent): boolean {
  return taker.side === 0
    ? maker.limitPriceTicks <= taker.limitPriceTicks
    : maker.limitPriceTicks >= taker.limitPriceTicks;
}

function comparePriority(side: TypedOrderIntent["side"], left: SequencedOrder, right: SequencedOrder): number {
  if (left.order.limitPriceTicks !== right.order.limitPriceTicks) {
    if (side === 0) return left.order.limitPriceTicks < right.order.limitPriceTicks ? -1 : 1;
    return left.order.limitPriceTicks > right.order.limitPriceTicks ? -1 : 1;
  }
  if (left.sequence === right.sequence) throw new Error("Resting orders cannot share an intake sequence");
  return left.sequence < right.sequence ? -1 : 1;
}

export function planPriceTimeMatches(
  taker: SequencedOrder,
  restingOrders: readonly SequencedOrder[],
): MatchPlan {
  const takerOrderHash = normalizeHex32(taker.orderHash, "Taker order hash");
  if (taker.sequence <= 0n || taker.sequence > UINT64_MAX) throw new RangeError("Taker sequence must be a positive uint64");
  if (taker.remainingBaseAtoms <= 0n || taker.remainingBaseAtoms > taker.order.baseAmountAtoms) {
    throw new RangeError("Taker remaining amount is invalid");
  }

  const seenOrderHashes = new Set<string>();
  const candidates = restingOrders.map((candidate) => ({
    ...candidate,
    orderHash: normalizeHex32(candidate.orderHash, "Maker order hash"),
  })).filter((candidate) => {
    if (candidate.sequence <= 0n || candidate.sequence > UINT64_MAX) throw new RangeError("Maker sequence must be a positive uint64");
    if (seenOrderHashes.has(candidate.orderHash)) throw new Error("Resting order hash is duplicated");
    seenOrderHashes.add(candidate.orderHash);
    if (candidate.remainingBaseAtoms <= 0n || candidate.remainingBaseAtoms > candidate.order.baseAmountAtoms) {
      throw new RangeError("Maker remaining amount is invalid");
    }
    return candidate.sequence < taker.sequence
      && candidate.order.timeInForce === 0
      && candidate.order.side !== taker.order.side
      && normalizeHex32(candidate.order.makerAccountId, "Maker account ID") !== normalizeHex32(taker.order.makerAccountId, "Taker account ID")
      && samePair(candidate.order, taker.order)
      && crosses(taker.order, candidate.order);
  }).sort((left, right) => comparePriority(taker.order.side, left, right));

  let remaining = taker.remainingBaseAtoms;
  const fills: PlannedFill[] = [];
  for (const maker of candidates) {
    const amount = maker.remainingBaseAtoms < remaining ? maker.remainingBaseAtoms : remaining;
    fills.push({
      makerOrderHash: maker.orderHash,
      takerOrderHash,
      makerSequence: maker.sequence,
      executionPriceTicks: maker.order.limitPriceTicks,
      baseAmountAtoms: amount,
    });
    remaining -= amount;
    if (remaining === 0n) break;
  }

  if (taker.order.timeInForce === 2 && remaining > 0n) {
    return { fills: [], remainingBaseAtoms: taker.remainingBaseAtoms, status: "fok-rejected" };
  }
  if (remaining === 0n) return { fills, remainingBaseAtoms: 0n, status: "filled" };
  if (fills.length === 0) return { fills, remainingBaseAtoms: remaining, status: "unfilled" };
  return { fills, remainingBaseAtoms: remaining, status: "partial" };
}
