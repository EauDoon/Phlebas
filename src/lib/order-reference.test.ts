import assert from "node:assert/strict";
import test from "node:test";

import { createOrderDomain, type TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import { orderActivity } from "./order-lifecycle.ts";
import { verifyReceiptChain } from "./order-receipts.ts";
import {
  acceptOrderIntent,
  createOrderReference,
  orderReferenceSnapshot,
  replayOrderReference,
  type OrderReferenceEvent,
} from "./order-reference.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "./order-domain.ts";

const pair = {
  baseChainId: chainIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d"),
  baseAssetId: assetIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133"),
  quoteChainId: chainIdentifier("eip155:42161"),
  quoteAssetId: assetIdentifier("eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831"),
};
const adapter = adapterIdentifier("no-value-reference-v1");
const maker = accountIdentifier("session:maker");

function order(nonce: bigint, epoch = 0n): TypedOrderIntent {
  return {
    makerAccountId: maker,
    authorizedSignerId: accountIdentifier("session:signer"),
    recipientAccountId: maker,
    ...pair,
    side: 1,
    baseAmountAtoms: 100_000_000n,
    limitPriceTicks: 5_000n,
    nonce,
    accountEpoch: epoch,
    expiry: 2_000n,
    salt: keccak256Text(`salt:${epoch}:${nonce}`),
    timeInForce: 0,
    maximumFeeBps: 30n,
    allowedVenues: 1,
    settlementAdapterId: adapter,
  };
}

function initial() {
  return createOrderReference({
    domain: createOrderDomain(42161n, "0x1111111111111111111111111111111111111111"),
    pair,
    settlementAdapterId: adapter,
    maximumLifetimeSeconds: 1_500n,
  });
}

test("accepts a policy-valid intent atomically into nonce and receipt state", () => {
  const result = acceptOrderIntent(initial(), order(1n), 1_000n);
  assert.equal(result.accepted.sequence, 1n);
  assert.equal(result.accepted.remainingBaseAtoms, 100_000_000n);
  assert.equal(verifyReceiptChain(result.state.receiptChain), true);
  assert.equal(orderActivity(result.state.lifecycle, result.accepted.orderHash, result.accepted.order, 1_500n).active, true);
});

test("a rejected acceptance leaves the caller-owned immutable state unchanged", () => {
  const state = initial();
  const before = orderReferenceSnapshot(state);
  assert.throws(() => acceptOrderIntent(state, { ...order(1n), expiry: 1_000n }, 1_000n), /future/);
  assert.equal(orderReferenceSnapshot(state), before);
  assert.equal(state.receiptChain.receipts.length, 0);
});

test("replays intake, cancellation, and epoch events to an identical snapshot", () => {
  const events: OrderReferenceEvent[] = [
    { kind: "accept", order: order(1n), acceptedAtSeconds: 1_000n },
    { kind: "cancel-nonce", accountId: maker, accountEpoch: 0n, nonce: 1n },
    { kind: "advance-epoch", accountId: maker, nextEpoch: 1n },
    { kind: "accept", order: order(2n, 1n), acceptedAtSeconds: 1_001n },
  ];
  const first = replayOrderReference(initial(), events);
  const second = replayOrderReference(initial(), events);
  assert.equal(orderReferenceSnapshot(first), orderReferenceSnapshot(second));
  assert.equal(first.receiptChain.receipts.length, 2);
  assert.equal(verifyReceiptChain(first.receiptChain), true);
});

test("rejects nonce replay before appending another receipt", () => {
  const first = acceptOrderIntent(initial(), order(1n), 1_000n).state;
  const head = first.receiptChain.head;
  assert.throws(() => acceptOrderIntent(first, { ...order(1n), salt: keccak256Text("different") }, 1_001n), /nonce is already claimed/);
  assert.equal(first.receiptChain.head, head);
  assert.equal(first.receiptChain.receipts.length, 1);
});
