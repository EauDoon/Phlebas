import { hashTypedOrder, type OrderDomain, type TypedOrderIntent } from "./eip712-order.ts";
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
import type { Hex32 } from "./order-domain.ts";
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
  const orderHash = hashTypedOrder(state.domain, order);
  const lifecycle = claimOrderNonce(state.lifecycle, orderHash, order);
  const appended = appendIntakeReceipt(state.receiptChain, orderHash, acceptedAtSeconds);
  const accepted: SequencedOrder = {
    orderHash,
    sequence: appended.receipt.sequence,
    order,
    remainingBaseAtoms: order.baseAmountAtoms,
  };
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
  return {
    ...state,
    lifecycle: advanceAccountEpoch(state.lifecycle, event.accountId, event.nextEpoch),
  };
}

export function replayOrderReference(
  initial: OrderReferenceState,
  events: readonly OrderReferenceEvent[],
): OrderReferenceState {
  return events.reduce(applyOrderReferenceEvent, initial);
}

export function orderReferenceSnapshot(state: OrderReferenceState): string {
  const epochs = Object.entries(state.lifecycle.accountEpochs)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([account, epoch]) => `${account}:${epoch}`)
    .join(",");
  const cancelled = Object.keys(state.lifecycle.cancelledNonceKeys).sort().join(",");
  const accepted = Object.values(state.acceptedOrders)
    .sort((left, right) => left.sequence < right.sequence ? -1 : 1)
    .map((entry) => `${entry.sequence}:${entry.orderHash}:${entry.remainingBaseAtoms}`)
    .join(",");
  return `head=${state.receiptChain.head}|next=${state.receiptChain.nextSequence}|epochs=${epochs}|cancelled=${cancelled}|accepted=${accepted}`;
}
