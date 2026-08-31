import { hashOrderDomain, hashOrderStruct, hashTypedOrder, type OrderDomain, type TypedOrderIntent } from "./eip712-order.ts";
import {
  activeAccountEpoch,
  advanceAccountEpoch,
  cancelOrderNonce,
  claimOrderNonce,
  emptyOrderLifecycle,
  orderNonceKey,
  type OrderLifecycleState,
} from "./order-lifecycle.ts";
import { assertOrderPolicy, type OrderPair } from "./order-policy.ts";
import { appendIntakeReceipt, emptyReceiptChain, verifyReceiptChain, type ReceiptChain } from "./order-receipts.ts";
import { UINT64_MAX, normalizeHex32, type Hex32 } from "./order-domain.ts";
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
  if (typeof maximumLifetimeSeconds !== "bigint") throw new TypeError("Maximum order lifetime must be a bigint");
  if (maximumLifetimeSeconds <= 0n || maximumLifetimeSeconds > UINT64_MAX) {
    throw new RangeError("Maximum order lifetime must be a positive uint64");
  }
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

function canonicalHex32(value: string, label: string): Hex32 {
  const normalized = normalizeHex32(value, label);
  if (value !== normalized) throw new TypeError(`${label} must be canonical`);
  return normalized;
}

function canonicalUint64(value: bigint, label: string, allowZero = true): bigint {
  if (typeof value !== "bigint") throw new TypeError(`${label} must be a bigint`);
  if (value < (allowZero ? 0n : 1n) || value > UINT64_MAX) {
    throw new RangeError(`${label} must fit ${allowZero ? "uint64" : "a positive uint64"}`);
  }
  return value;
}

function canonicalNonceKey(key: string, label: string): string {
  const parts = key.split(":");
  if (parts.length !== 3 || !/^(?:0|[1-9][0-9]*)$/.test(parts[1] ?? "") || !/^(?:0|[1-9][0-9]*)$/.test(parts[2] ?? "")) {
    throw new TypeError(`${label} is not canonical`);
  }
  const accountId = canonicalHex32(parts[0] ?? "", `${label} account ID`);
  const accountEpoch = canonicalUint64(BigInt(parts[1]), `${label} account epoch`);
  const nonce = canonicalUint64(BigInt(parts[2]), `${label} nonce`);
  const normalized = orderNonceKey({ makerAccountId: accountId, accountEpoch, nonce });
  if (key !== normalized) throw new TypeError(`${label} is not canonical`);
  return normalized;
}

function trueMarkerKeys(markers: Readonly<Record<string, true>>, label: string): string[] {
  return Object.entries(markers).map(([key, value]) => {
    if (value !== true) throw new TypeError(`${label} marker must be true`);
    return key;
  });
}

export function orderReferenceSnapshot(state: OrderReferenceState): string {
  if (!verifyReceiptChain(state.receiptChain)) throw new Error("Order reference receipt chain is invalid");
  const maximumLifetimeSeconds = canonicalUint64(state.maximumLifetimeSeconds, "Maximum order lifetime", false);
  const configuration = [
    hashOrderDomain(state.domain),
    normalizeHex32(state.pair.baseChainId, "Base chain ID"),
    normalizeHex32(state.pair.baseAssetId, "Base asset ID"),
    normalizeHex32(state.pair.quoteChainId, "Quote chain ID"),
    normalizeHex32(state.pair.quoteAssetId, "Quote asset ID"),
    normalizeHex32(state.settlementAdapterId, "Settlement adapter ID"),
    maximumLifetimeSeconds.toString(),
  ].join(":");
  const epochs = Object.entries(state.lifecycle.accountEpochs)
    .map(([account, epoch]) => [
      canonicalHex32(account, "Account epoch account ID"),
      canonicalUint64(epoch, "Account epoch"),
    ] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([account, epoch]) => `${account}:${epoch}`)
    .join(",");
  const cancelled = trueMarkerKeys(state.lifecycle.cancelledNonceKeys, "Cancelled nonce")
    .map((key) => canonicalNonceKey(key, "Cancelled nonce key"))
    .sort()
    .join(",");
  const claims = Object.entries(state.lifecycle.nonceClaims)
    .map(([key, orderHash]) => [
      canonicalNonceKey(key, "Nonce claim key"),
      canonicalHex32(orderHash, "Nonce claim order hash"),
    ] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, orderHash]) => `${key}:${orderHash}`)
    .join(",");
  const acceptedHashes = trueMarkerKeys(state.lifecycle.acceptedOrderHashes, "Accepted order")
    .map((orderHash) => canonicalHex32(orderHash, "Accepted order hash"))
    .sort();
  const bindings = Object.entries(state.lifecycle.acceptedOrderStructHashes)
    .map(([orderHash, structHash]) => [
      canonicalHex32(orderHash, "Accepted binding order hash"),
      canonicalHex32(structHash, "Accepted binding struct hash"),
    ] as const)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([orderHash, structHash]) => `${orderHash}:${structHash}`)
    .join(",");
  const receiptByOrderHash = new Map(
    state.receiptChain.receipts.map((receipt) => [canonicalHex32(receipt.orderHash, "Receipt order hash"), receipt]),
  );
  const seenSequences = new Set<bigint>();
  const acceptedEntries = Object.entries(state.acceptedOrders).map(([recordKey, entry]) => {
    const key = canonicalHex32(recordKey, "Accepted order record key");
    const orderHash = canonicalHex32(entry.orderHash, "Accepted order entry hash");
    if (key !== orderHash) throw new Error("Accepted order record key does not match its order hash");
    const sequence = canonicalUint64(entry.sequence, "Accepted order sequence", false);
    if (seenSequences.has(sequence)) throw new Error("Accepted order sequence is duplicated");
    seenSequences.add(sequence);
    if (typeof entry.remainingBaseAtoms !== "bigint") throw new TypeError("Accepted remaining amount must be a bigint");
    if (entry.remainingBaseAtoms < 0n || entry.remainingBaseAtoms > entry.order.baseAmountAtoms) {
      throw new RangeError("Accepted remaining amount is outside the signed order amount");
    }
    const structHash = hashOrderStruct(entry.order);
    if (hashTypedOrder(state.domain, entry.order) !== orderHash) throw new Error("Accepted order hash does not bind its order body");
    if (state.lifecycle.acceptedOrderStructHashes[key] !== structHash) throw new Error("Accepted order struct binding is inconsistent");
    if (state.lifecycle.nonceClaims[orderNonceKey(entry.order)] !== key) throw new Error("Accepted order nonce claim is inconsistent");
    const receipt = receiptByOrderHash.get(key);
    if (!receipt || receipt.sequence !== sequence) throw new Error("Accepted order receipt is missing or inconsistent");
    return { key, entry, sequence, structHash };
  });
  const acceptedOrderKeys = acceptedEntries.map(({ key }) => key).sort();
  if (acceptedHashes.join(",") !== acceptedOrderKeys.join(",")) {
    throw new Error("Accepted order markers do not match accepted order records");
  }
  if (state.receiptChain.receipts.length !== acceptedEntries.length) {
    throw new Error("Receipt chain does not match accepted order records");
  }
  const accepted = acceptedEntries
    .sort((left, right) => left.sequence < right.sequence ? -1 : left.sequence > right.sequence ? 1 : 0)
    .map(({ key, entry, sequence, structHash }) => `${key}:${sequence}:${entry.orderHash}:${structHash}:${entry.remainingBaseAtoms}`)
    .join(",");
  return `config=${configuration}|head=${state.receiptChain.head}|next=${state.receiptChain.nextSequence}|epochs=${epochs}|cancelled=${cancelled}|claims=${claims}|accepted-hashes=${acceptedHashes.join(",")}|bindings=${bindings}|accepted=${accepted}`;
}
