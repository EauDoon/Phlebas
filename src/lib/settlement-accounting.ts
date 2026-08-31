import { keccak256Text } from "./keccak.ts";
import { orderActivity, type OrderLifecycleState } from "./order-lifecycle.ts";
import { MAX_ORDER_FEE_BPS, UINT256_MAX, normalizeHex32, type Hex32 } from "./order-domain.ts";
import type { PlannedFill, SequencedOrder } from "./price-time.ts";

export type AtomicBalance = Readonly<{
  baseAtoms: bigint;
  quoteAtoms: bigint;
}>;

export type SettlementLedger = Readonly<{
  balances: Readonly<Record<string, AtomicBalance>>;
  filledBaseAtoms: Readonly<Record<string, bigint>>;
  appliedFillIds: Readonly<Record<string, true>>;
}>;

export type SettlementParameters = Readonly<{
  nowSeconds: bigint;
  quoteCostDivisor: bigint;
  makerFeeBps: bigint;
  takerFeeBps: bigint;
  feeRecipientAccountId: Hex32;
}>;

export type AppliedSettlement = Readonly<{
  ledger: SettlementLedger;
  fillId: Hex32;
  quoteAmountAtoms: bigint;
  buyerFeeAtoms: bigint;
  sellerFeeAtoms: bigint;
}>;

export function createSettlementLedger(
  balances: Readonly<Record<string, AtomicBalance>> = {},
): SettlementLedger {
  const normalized: Record<string, AtomicBalance> = {};
  for (const [accountId, balance] of Object.entries(balances)) {
    const account = normalizeHex32(accountId, "Balance account ID");
    if (Object.prototype.hasOwnProperty.call(normalized, account)) throw new Error("Balance account ID is duplicated after normalization");
    if (balance.baseAtoms < 0n || balance.quoteAtoms < 0n
      || balance.baseAtoms > UINT256_MAX || balance.quoteAtoms > UINT256_MAX) {
      throw new RangeError("Balances must fit uint256");
    }
    normalized[account] = { ...balance };
  }
  return { balances: normalized, filledBaseAtoms: {}, appliedFillIds: {} };
}

export function balanceOf(ledger: SettlementLedger, accountId: Hex32): AtomicBalance {
  return ledger.balances[normalizeHex32(accountId, "Balance account ID")] ?? { baseAtoms: 0n, quoteAtoms: 0n };
}

function divideUp(numerator: bigint, denominator: bigint): bigint {
  if (numerator === 0n) return 0n;
  return ((numerator - 1n) / denominator) + 1n;
}

function feeAtoms(amount: bigint, feeBps: bigint): bigint {
  return (amount * feeBps) / 10_000n;
}

function samePair(left: SequencedOrder, right: SequencedOrder): boolean {
  return left.order.baseChainId === right.order.baseChainId
    && left.order.baseAssetId === right.order.baseAssetId
    && left.order.quoteChainId === right.order.quoteChainId
    && left.order.quoteAssetId === right.order.quoteAssetId
    && left.order.settlementAdapterId === right.order.settlementAdapterId;
}

function assertFillShape(fill: PlannedFill, maker: SequencedOrder, taker: SequencedOrder): void {
  if (normalizeHex32(fill.makerOrderHash, "Fill maker order hash") !== normalizeHex32(maker.orderHash, "Maker order hash")
    || normalizeHex32(fill.takerOrderHash, "Fill taker order hash") !== normalizeHex32(taker.orderHash, "Taker order hash")) {
    throw new Error("Fill order hashes do not match supplied orders");
  }
  if (fill.makerSequence !== maker.sequence || maker.sequence >= taker.sequence) throw new Error("Fill violates intake sequencing");
  if (fill.executionPriceTicks !== maker.order.limitPriceTicks) throw new Error("Execution must use the maker price");
  if (fill.baseAmountAtoms <= 0n) throw new RangeError("Fill amount must be positive");
  if (maker.order.side === taker.order.side || !samePair(maker, taker)) throw new Error("Orders are not a compatible opposing pair");
  if (normalizeHex32(maker.order.makerAccountId, "Maker account ID")
    === normalizeHex32(taker.order.makerAccountId, "Taker account ID")) throw new Error("Self-trading is not allowed");
  const buy = maker.order.side === 0 ? maker.order : taker.order;
  const sell = maker.order.side === 1 ? maker.order : taker.order;
  if (buy.limitPriceTicks < fill.executionPriceTicks || sell.limitPriceTicks > fill.executionPriceTicks) {
    throw new Error("Execution price violates a signed limit");
  }
}

function quoteForLimits(fill: PlannedFill, maker: SequencedOrder, taker: SequencedOrder, divisor: bigint): bigint {
  if (divisor <= 0n || divisor > UINT256_MAX) throw new RangeError("Quote cost divisor must be a positive uint256");
  const buy = maker.order.side === 0 ? maker.order : taker.order;
  const sell = maker.order.side === 1 ? maker.order : taker.order;
  const minimumForSeller = divideUp(fill.baseAmountAtoms * sell.limitPriceTicks, divisor);
  const maximumForBuyer = (fill.baseAmountAtoms * buy.limitPriceTicks) / divisor;
  if (minimumForSeller > maximumForBuyer) throw new Error("Fill cannot preserve both signed limits after integer rounding");

  const makerNumerator = fill.baseAmountAtoms * fill.executionPriceTicks;
  const atMakerPrice = maker.order.side === 1
    ? divideUp(makerNumerator, divisor)
    : makerNumerator / divisor;
  if (atMakerPrice < minimumForSeller || atMakerPrice > maximumForBuyer) {
    throw new Error("Maker-price rounding violates a signed limit");
  }
  if (atMakerPrice > UINT256_MAX) throw new RangeError("Settled quote amount exceeds uint256");
  return atMakerPrice;
}

type Delta = { baseAtoms: bigint; quoteAtoms: bigint };

function addDelta(deltas: Record<string, Delta>, accountId: Hex32, baseAtoms: bigint, quoteAtoms: bigint): void {
  const account = normalizeHex32(accountId, "Settlement account ID");
  const current = deltas[account] ?? { baseAtoms: 0n, quoteAtoms: 0n };
  deltas[account] = { baseAtoms: current.baseAtoms + baseAtoms, quoteAtoms: current.quoteAtoms + quoteAtoms };
}

function applyDeltas(ledger: SettlementLedger, deltas: Record<string, Delta>): Readonly<Record<string, AtomicBalance>> {
  const balances: Record<string, AtomicBalance> = { ...ledger.balances };
  for (const [account, delta] of Object.entries(deltas)) {
    const current = balances[account] ?? { baseAtoms: 0n, quoteAtoms: 0n };
    const next = { baseAtoms: current.baseAtoms + delta.baseAtoms, quoteAtoms: current.quoteAtoms + delta.quoteAtoms };
    if (next.baseAtoms < 0n || next.quoteAtoms < 0n) throw new Error("Settlement account has insufficient atomic balance");
    if (next.baseAtoms > UINT256_MAX || next.quoteAtoms > UINT256_MAX) throw new RangeError("Settlement balance exceeds uint256");
    balances[account] = next;
  }
  return balances;
}

export function settlePlannedFill(
  ledger: SettlementLedger,
  lifecycle: OrderLifecycleState,
  fill: PlannedFill,
  maker: SequencedOrder,
  taker: SequencedOrder,
  parameters: SettlementParameters,
): AppliedSettlement {
  assertFillShape(fill, maker, taker);
  const makerOrderHash = normalizeHex32(maker.orderHash, "Maker order hash");
  const takerOrderHash = normalizeHex32(taker.orderHash, "Taker order hash");
  for (const [role, sequenced] of [["Maker", maker], ["Taker", taker]] as const) {
    const orderHash = normalizeHex32(sequenced.orderHash, `${role} order hash`);
    const activity = orderActivity(lifecycle, orderHash, sequenced.order, parameters.nowSeconds);
    if (!activity.active) throw new Error(`${role} order is not active: ${activity.reason}`);
    const filled = ledger.filledBaseAtoms[orderHash] ?? 0n;
    if (sequenced.remainingBaseAtoms !== sequenced.order.baseAmountAtoms - filled) throw new Error(`${role} remaining amount does not reconcile`);
    if (fill.baseAmountAtoms > sequenced.remainingBaseAtoms) throw new Error(`${role} order would be overfilled`);
  }
  if (parameters.makerFeeBps < 0n || parameters.makerFeeBps > MAX_ORDER_FEE_BPS || parameters.makerFeeBps > maker.order.maximumFeeBps) {
    throw new Error("Maker fee exceeds its signed or protocol cap");
  }
  if (parameters.takerFeeBps < 0n || parameters.takerFeeBps > MAX_ORDER_FEE_BPS || parameters.takerFeeBps > taker.order.maximumFeeBps) {
    throw new Error("Taker fee exceeds its signed or protocol cap");
  }

  const quoteAmountAtoms = quoteForLimits(fill, maker, taker, parameters.quoteCostDivisor);
  const makerFee = feeAtoms(quoteAmountAtoms, parameters.makerFeeBps);
  const takerFee = feeAtoms(quoteAmountAtoms, parameters.takerFeeBps);
  if (quoteAmountAtoms + makerFee > UINT256_MAX || quoteAmountAtoms + takerFee > UINT256_MAX) {
    throw new RangeError("Settlement debit exceeds uint256");
  }
  const buyer = maker.order.side === 0 ? maker : taker;
  const seller = maker.order.side === 1 ? maker : taker;
  const buyerFeeAtoms = maker.order.side === 0 ? makerFee : takerFee;
  const sellerFeeAtoms = maker.order.side === 1 ? makerFee : takerFee;
  if (sellerFeeAtoms > quoteAmountAtoms) throw new Error("Seller fee exceeds settled quote output");

  const makerFilledBefore = ledger.filledBaseAtoms[makerOrderHash] ?? 0n;
  const takerFilledBefore = ledger.filledBaseAtoms[takerOrderHash] ?? 0n;
  const fillId = keccak256Text([
    "PhlebasAppliedFill:v1",
    makerOrderHash,
    takerOrderHash,
    makerFilledBefore.toString(),
    takerFilledBefore.toString(),
    fill.baseAmountAtoms.toString(),
    fill.executionPriceTicks.toString(),
  ].join("|"));
  if (ledger.appliedFillIds[fillId]) throw new Error("Fill replayed");

  const deltas: Record<string, Delta> = {};
  addDelta(deltas, seller.order.makerAccountId, -fill.baseAmountAtoms, 0n);
  addDelta(deltas, buyer.order.recipientAccountId, fill.baseAmountAtoms, 0n);
  addDelta(deltas, buyer.order.makerAccountId, 0n, -(quoteAmountAtoms + buyerFeeAtoms));
  addDelta(deltas, seller.order.recipientAccountId, 0n, quoteAmountAtoms - sellerFeeAtoms);
  addDelta(deltas, parameters.feeRecipientAccountId, 0n, buyerFeeAtoms + sellerFeeAtoms);

  return {
    fillId,
    quoteAmountAtoms,
    buyerFeeAtoms,
    sellerFeeAtoms,
    ledger: {
      balances: applyDeltas(ledger, deltas),
      filledBaseAtoms: {
        ...ledger.filledBaseAtoms,
        [makerOrderHash]: makerFilledBefore + fill.baseAmountAtoms,
        [takerOrderHash]: takerFilledBefore + fill.baseAmountAtoms,
      },
      appliedFillIds: { ...ledger.appliedFillIds, [fillId]: true },
    },
  };
}
