import assert from "node:assert/strict";
import test from "node:test";

import type { TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import {
  activeAccountEpoch,
  advanceAccountEpoch,
  cancelOrderNonce,
  claimOrderNonce,
  emptyOrderLifecycle,
  orderActivity,
} from "./order-lifecycle.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "./order-domain.ts";

const maker = accountIdentifier("session:maker");
const order: TypedOrderIntent = {
  makerAccountId: maker,
  authorizedSignerId: accountIdentifier("session:signer"),
  recipientAccountId: maker,
  baseChainId: chainIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d"),
  baseAssetId: assetIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133"),
  quoteChainId: chainIdentifier("eip155:42161"),
  quoteAssetId: assetIdentifier("eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831"),
  side: 0,
  baseAmountAtoms: 100n,
  limitPriceTicks: 5_000n,
  nonce: 7n,
  accountEpoch: 0n,
  expiry: 10_000n,
  salt: keccak256Text("salt"),
  timeInForce: 0,
  maximumFeeBps: 30n,
  allowedVenues: 1,
  settlementAdapterId: adapterIdentifier("no-value-reference-v1"),
};

test("claims a nonce once and rejects hash or nonce replay", () => {
  const hash = keccak256Text("order-1");
  const claimed = claimOrderNonce(emptyOrderLifecycle(), hash, order);
  assert.equal(orderActivity(claimed, hash, order, 9_000n).active, true);
  assert.throws(() => claimOrderNonce(claimed, hash, order), /hash replayed/);
  assert.throws(() => claimOrderNonce(claimed, keccak256Text("order-2"), { ...order, salt: keccak256Text("other") }), /nonce is already claimed/);
});

test("a cancellation prevents later intake and deactivates an accepted order", () => {
  const hash = keccak256Text("order-1");
  const cancelledFirst = cancelOrderNonce(emptyOrderLifecycle(), maker, 0n, order.nonce);
  assert.throws(() => claimOrderNonce(cancelledFirst, hash, order), /nonce is cancelled/);

  const claimed = claimOrderNonce(emptyOrderLifecycle(), hash, order);
  const cancelledAfter = cancelOrderNonce(claimed, maker, 0n, order.nonce);
  assert.deepEqual(orderActivity(cancelledAfter, hash, order, 9_000n), { active: false, reason: "nonce-cancelled" });
});

test("epoch advancement invalidates every older order without enumerating nonces", () => {
  const hash = keccak256Text("order-1");
  const claimed = claimOrderNonce(emptyOrderLifecycle(), hash, order);
  const advanced = advanceAccountEpoch(claimed, maker, 2n);
  assert.equal(activeAccountEpoch(advanced, maker), 2n);
  assert.deepEqual(orderActivity(advanced, hash, order, 9_000n), { active: false, reason: "epoch-invalidated" });
  assert.throws(() => advanceAccountEpoch(advanced, maker, 2n), /increase monotonically/);
});

test("expiry and unknown hashes fail closed", () => {
  const hash = keccak256Text("order-1");
  const claimed = claimOrderNonce(emptyOrderLifecycle(), hash, order);
  assert.deepEqual(orderActivity(claimed, hash, order, 10_000n), { active: false, reason: "expired" });
  assert.deepEqual(orderActivity(claimed, keccak256Text("unknown"), order, 9_000n), { active: false, reason: "not-accepted" });
});
