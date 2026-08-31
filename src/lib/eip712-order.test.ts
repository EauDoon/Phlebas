import assert from "node:assert/strict";
import test from "node:test";

import {
  createOrderDomain,
  hashOrderDomain,
  hashOrderStruct,
  hashTypedOrder,
  typedOrderData,
  type TypedOrderIntent,
} from "./eip712-order.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "./order-domain.ts";

const domain = createOrderDomain(42161n, "0x1111111111111111111111111111111111111111");
const order: TypedOrderIntent = {
  makerAccountId: accountIdentifier("session:maker-1"),
  authorizedSignerId: accountIdentifier("session:signer-1"),
  baseChainId: chainIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d"),
  baseAssetId: assetIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133"),
  quoteChainId: chainIdentifier("eip155:42161"),
  quoteAssetId: assetIdentifier("eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831"),
  side: 0,
  baseAmountAtoms: 100_000_000n,
  limitPriceTicks: 5_291n,
  nonce: 1n,
  accountEpoch: 0n,
  expiry: 2_000_000_000n,
  salt: `0x${"01".repeat(32)}`,
  recipientAccountId: accountIdentifier("session:recipient-1"),
  timeInForce: 0,
  maximumFeeBps: 30n,
  allowedVenues: 1,
  settlementAdapterId: adapterIdentifier("no-value-reference-v1"),
};

test("creates deterministic EIP-712 domain, struct, and final hashes", () => {
  assert.equal(hashOrderDomain(domain), hashOrderDomain({ ...domain }));
  assert.equal(hashOrderStruct(order), hashOrderStruct({ ...order }));
  assert.equal(hashTypedOrder(domain, order), hashTypedOrder(domain, { ...order }));
  assert.match(hashTypedOrder(domain, order), /^0x[0-9a-f]{64}$/);
  assert.notEqual(hashTypedOrder(domain, order), hashTypedOrder(domain, { ...order, nonce: 2n }));
  assert.notEqual(hashTypedOrder(domain, order), hashTypedOrder(createOrderDomain(42162n, domain.verifyingContract), order));
});

test("exports JSON-compatible typed data with explicit chain and asset identifiers", () => {
  const data = typedOrderData(domain, order);
  assert.equal(data.primaryType, "OrderIntent");
  assert.equal(data.domain.chainId, "42161");
  assert.equal(data.message.baseAmountAtoms, "100000000");
  assert.equal(data.message.baseChainId, order.baseChainId);
  assert.equal(data.types.OrderIntent.length, 18);
  assert.doesNotThrow(() => JSON.stringify(data));
});

test("rejects invalid fixed-width values and integer overflow before hashing", () => {
  assert.throws(() => hashOrderStruct({ ...order, nonce: 1n << 64n }), /uint64/);
  assert.throws(() => hashOrderStruct({ ...order, makerAccountId: "0x12" }), /32 bytes/);
  assert.throws(() => createOrderDomain(0n, domain.verifyingContract), /positive/);
  assert.throws(() => createOrderDomain(42161n, "0x1234"), /20 bytes/);
});

test("binds the settlement adapter and both asset-chain pairs", () => {
  const digest = hashTypedOrder(domain, order);
  assert.notEqual(digest, hashTypedOrder(domain, { ...order, settlementAdapterId: adapterIdentifier("other-v1") }));
  assert.notEqual(digest, hashTypedOrder(domain, { ...order, baseChainId: chainIdentifier("eip155:42161") }));
  assert.notEqual(digest, hashTypedOrder(domain, { ...order, quoteAssetId: order.baseAssetId }));
});
