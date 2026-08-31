import { hashOrderDomain, hashOrderStruct, hashTypedOrder, type OrderDomain, type TypedOrderIntent } from "./eip712-order.ts";
import {
  activeAccountEpoch,
  advanceAccountEpoch,
  cancelOrderNonce,
  claimOrderNonce,
  emptyOrderLifecycle,
  type OrderLifecycleState,
} from "./order-lifecycle.ts";
import { assertOrderPolicy, type OrderPair } from "./order-policy.ts";
import { appendIntakeReceipt, emptyReceiptChain, type ReceiptChain } from "./order-receipts.ts";
import { normalizeHex32, type Hex32 } from "./order-domain.ts";
import type { SequencedOrder } from "./price-time.ts";

export type OrderReferenceState = Readonly<{
  domain: OrderDomain;
  pair: OrderPair;
  settlementAdapterId: Hex32;
  maximumLifetimeSeconds: bigint;
  lifecycle: OrderLifecycleState;
  receiptChain: ReceiptChain;
  acceptedOrders: Readonly<Record<string, SequencedOrder>>;
}>;

export type OrderReferenceEvent =
  | Readonly<{ kind: "accept"; order: TypedOrderIntent; acceptedAtSeconds: bigint }>
  | Readonly<{ kind: "cancel-nonce"; accountId: Hex32; accountEpoch: bigint; nonce: bigint }>
  | Readonly<{ kind: "advance-epoch"; accountId: Hex32; nextEpoch: bigint }>;

export function createOrderReference(options: {
  domain: OrderDomain;
  pair: OrderPair;
  settlementAdapterId: Hex32;
  maximumLifetimeSeconds?: bigint;
}): OrderReferenceState {
  const maximumLifetimeSeconds = options.maximumLifetimeSeconds ?? 86_400n;
  if (maximumLifetimeSeconds <= 0n) throw new RangeError("Maximum order lifetime must be positive");
  return {
    ...options,
    maximumLifetimeSeconds,
    lifecycle: emptyOrderLifecycle(),
    receiptChain: emptyReceiptChain(),
    acceptedOrders: {},
  };
}

export function acceptOrderIntent(
  state: OrderReferenceState,
  order: TypedOrderIntent,
  acceptedAtSeconds: bigint,
): { state: OrderReferenceState; accepted: SequencedOrder } {
  assertOrderPolicy(order, {
    nowSeconds: acceptedAtSeconds,
    activeAccountEpoch: activeAccountEpoch(state.lifecycle, order.makerAccountId),
    pair: state.pair,
    settlementAdapterId: state.settlementAdapterId,
    maximumLifetimeSeconds: state.maximumLifetimeSeconds,
  });
  const acceptedOrder = Object.freeze({
    ...order,
    makerAccountId: normalizeHex32(order.makerAccountId, "Maker account ID"),
    authorizedSignerId: normalizeHex32(order.authorizedSignerId, "Authorized signer ID"),
    baseChainId: normalizeHex32(order.baseChainId, "Base chain ID"),
    baseAssetId: normalizeHex32(order.baseAssetId, "Base asset ID"),
    quoteChainId: normalizeHex32(order.quoteChainId, "Quote chain ID"),
    quoteAssetId: normalizeHex32(order.quoteAssetId, "Quote asset ID"),
    salt: normalizeHex32(order.salt, "Salt"),
    recipientAccountId: normalizeHex32(order.recipientAccountId, "Recipient account ID"),
    settlementAdapterId: normalizeHex32(order.settlementAdapterId, "Settlement adapter ID"),
  }) satisfies TypedOrderIntent;
  const orderHash = hashTypedOrder(state.domain, acceptedOrder);
  const lifecycle = claimOrderNonce(state.lifecycle, orderHash, acceptedOrder);
  const appended = appendIntakeReceipt(state.receiptChain, orderHash, acceptedAtSeconds);
  const accepted: SequencedOrder = Object.freeze({
    orderHash,
    sequence: appended.receipt.sequence,
    order: acceptedOrder,
    remainingBaseAtoms: acceptedOrder.baseAmountAtoms,
  });
  return {
    accepted,
    state: {
      ...state,
      lifecycle,
      receiptChain: appended.chain,
      acceptedOrders: { ...state.acceptedOrders, [orderHash]: accepted },
    },
  };
}

export function applyOrderReferenceEvent(
  state: OrderReferenceState,
  event: OrderReferenceEvent,
): OrderReferenceState {
  if (event.kind === "accept") return acceptOrderIntent(state, event.order, event.acceptedAtSeconds).state;
  if (event.kind === "cancel-nonce") {
    return {
      ...state,
      lifecycle: cancelOrderNonce(state.lifecycle, event.accountId, event.accountEpoch, event.nonce),
    };
  }
  if (event.kind === "advance-epoch") {
    return {
      ...state,
      lifecycle: advanceAccountEpoch(state.lifecycle, event.accountId, event.nextEpoch),
    };
  }
  throw new TypeError("Unknown order reference event kind");
}

export function replayOrderReference(
  initial: OrderReferenceState,
  events: readonly OrderReferenceEvent[],
): OrderReferenceState {
  return events.reduce(applyOrderReferenceEvent, initial);
}

export function orderReferenceSnapshot(state: OrderReferenceState): string {
  const configuration = [
    hashOrderDomain(state.domain),
    normalizeHex32(state.pair.baseChainId, "Base chain ID"),
    normalizeHex32(state.pair.baseAssetId, "Base asset ID"),
    normalizeHex32(state.pair.quoteChainId, "Quote chain ID"),
    normalizeHex32(state.pair.quoteAssetId, "Quote asset ID"),
    normalizeHex32(state.settlementAdapterId, "Settlement adapter ID"),
    state.maximumLifetimeSeconds.toString(),
  ].join(":");
  const epochs = Object.entries(state.lifecycle.accountEpochs)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([account, epoch]) => `${account}:${epoch}`)
    .join(",");
  const cancelled = Object.keys(state.lifecycle.cancelledNonceKeys).sort().join(",");
  const claims = Object.entries(state.lifecycle.nonceClaims)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, orderHash]) => `${key}:${orderHash}`)
    .join(",");
  const bindings = Object.entries(state.lifecycle.acceptedOrderStructHashes)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([orderHash, structHash]) => `${orderHash}:${structHash}`)
    .join(",");
  const accepted = Object.values(state.acceptedOrders)
    .sort((left, right) => left.sequence < right.sequence ? -1 : 1)
    .map((entry) => `${entry.sequence}:${entry.orderHash}:${hashOrderStruct(entry.order)}:${entry.remainingBaseAtoms}`)
    .join(",");
  return `config=${configuration}|head=${state.receiptChain.head}|next=${state.receiptChain.nextSequence}|epochs=${epochs}|cancelled=${cancelled}|claims=${claims}|bindings=${bindings}|accepted=${accepted}`;
}
