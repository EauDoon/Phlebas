import { hashOrderStruct, type TypedOrderIntent } from "./eip712-order.ts";
import { UINT64_MAX, normalizeHex32, type Hex32 } from "./order-domain.ts";

export type OrderLifecycleState = Readonly<{
  accountEpochs: Readonly<Record<string, bigint>>;
  cancelledNonceKeys: Readonly<Record<string, true>>;
  nonceClaims: Readonly<Record<string, Hex32>>;
  acceptedOrderHashes: Readonly<Record<string, true>>;
  acceptedOrderStructHashes: Readonly<Record<string, Hex32>>;
}>;

export type OrderActivity = Readonly<{
  active: boolean;
  reason?: "expired" | "epoch-invalidated" | "nonce-cancelled" | "not-accepted" | "body-mismatch";
}>;

export function emptyOrderLifecycle(): OrderLifecycleState {
  return {
    accountEpochs: {},
    cancelledNonceKeys: {},
    nonceClaims: {},
    acceptedOrderHashes: {},
    acceptedOrderStructHashes: {},
  };
}

function normalizedAccount(accountId: Hex32): Hex32 {
  return normalizeHex32(accountId, "Maker account ID");
}

export function activeAccountEpoch(state: OrderLifecycleState, accountId: Hex32): bigint {
  return state.accountEpochs[normalizedAccount(accountId)] ?? 0n;
}

export function orderNonceKey(order: Pick<TypedOrderIntent, "makerAccountId" | "accountEpoch" | "nonce">): string {
  if (order.accountEpoch < 0n || order.accountEpoch > UINT64_MAX) throw new RangeError("Account epoch must fit uint64");
  if (order.nonce < 0n || order.nonce > UINT64_MAX) throw new RangeError("Nonce must fit uint64");
  return `${normalizedAccount(order.makerAccountId)}:${order.accountEpoch}:${order.nonce}`;
}

export function claimOrderNonce(
  state: OrderLifecycleState,
  orderHash: Hex32,
  order: TypedOrderIntent,
): OrderLifecycleState {
  const normalizedHash = normalizeHex32(orderHash, "Order hash");
  const structHash = hashOrderStruct(order);
  const key = orderNonceKey(order);
  if (order.accountEpoch !== activeAccountEpoch(state, order.makerAccountId)) {
    throw new Error("Order account epoch is not active");
  }
  if (state.cancelledNonceKeys[key]) throw new Error("Order nonce is cancelled");
  if (state.acceptedOrderHashes[normalizedHash]) throw new Error("Order hash replayed");
  if (state.nonceClaims[key]) throw new Error("Order nonce is already claimed");
  return {
    ...state,
    nonceClaims: { ...state.nonceClaims, [key]: normalizedHash },
    acceptedOrderHashes: { ...state.acceptedOrderHashes, [normalizedHash]: true },
    acceptedOrderStructHashes: { ...state.acceptedOrderStructHashes, [normalizedHash]: structHash },
  };
}

export function cancelOrderNonce(
  state: OrderLifecycleState,
  accountId: Hex32,
  accountEpoch: bigint,
  nonce: bigint,
): OrderLifecycleState {
  const key = orderNonceKey({ makerAccountId: accountId, accountEpoch, nonce });
  if (accountEpoch !== activeAccountEpoch(state, accountId)) {
    throw new Error("Only the active account epoch can cancel a nonce");
  }
  return {
    ...state,
    cancelledNonceKeys: { ...state.cancelledNonceKeys, [key]: true },
  };
}

export function advanceAccountEpoch(
  state: OrderLifecycleState,
  accountId: Hex32,
  nextEpoch: bigint,
): OrderLifecycleState {
  if (nextEpoch < 0n || nextEpoch > UINT64_MAX) throw new RangeError("Account epoch must fit uint64");
  const account = normalizedAccount(accountId);
  const current = activeAccountEpoch(state, account);
  if (nextEpoch <= current) throw new Error("Account epoch must increase monotonically");
  return {
    ...state,
    accountEpochs: { ...state.accountEpochs, [account]: nextEpoch },
  };
}

export function orderActivity(
  state: OrderLifecycleState,
  orderHash: Hex32,
  order: TypedOrderIntent,
  nowSeconds: bigint,
): OrderActivity {
  if (nowSeconds < 0n || nowSeconds > UINT64_MAX) throw new RangeError("Activity time must fit uint64");
  const normalizedHash = normalizeHex32(orderHash, "Order hash");
  if (!state.acceptedOrderHashes[normalizedHash]) return { active: false, reason: "not-accepted" };
  try {
    if (state.acceptedOrderStructHashes[normalizedHash] !== hashOrderStruct(order)) {
      return { active: false, reason: "body-mismatch" };
    }
  } catch {
    return { active: false, reason: "body-mismatch" };
  }
  if (order.expiry <= nowSeconds) return { active: false, reason: "expired" };
  if (order.accountEpoch !== activeAccountEpoch(state, order.makerAccountId)) return { active: false, reason: "epoch-invalidated" };
  if (state.cancelledNonceKeys[orderNonceKey(order)]) return { active: false, reason: "nonce-cancelled" };
  return { active: true };
}
