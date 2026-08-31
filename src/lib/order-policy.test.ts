import assert from "node:assert/strict";
import test from "node:test";

import type { TypedOrderIntent } from "./eip712-order.ts";
import { assertOrderPolicy, orderPolicyErrors, type OrderPolicyContext } from "./order-policy.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier, type Hex32 } from "./order-domain.ts";

const pair = {
  baseChainId: chainIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d"),
  baseAssetId: assetIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133"),
  quoteChainId: chainIdentifier("eip155:42161"),
  quoteAssetId: assetIdentifier("eip155:42161/erc20:0x2222222222222222222222222222222222222222"),
};
const adapter = adapterIdentifier("no-value-reference-v1");
const order: TypedOrderIntent = {
  makerAccountId: accountIdentifier("session:maker"),
  authorizedSignerId: accountIdentifier("session:signer"),
  recipientAccountId: accountIdentifier("session:recipient"),
  ...pair,
  side: 0,
  baseAmountAtoms: 100_000_000n,
  limitPriceTicks: 5_291n,
  nonce: 1n,
  accountEpoch: 3n,
  expiry: 1_001_000n,
  salt: `0x${"12".repeat(32)}`,
  timeInForce: 0,
  maximumFeeBps: 30n,
  allowedVenues: 1,
  settlementAdapterId: adapter,
};
const context: OrderPolicyContext = {
  nowSeconds: 1_000_000n,
  activeAccountEpoch: 3n,
  pair,
  settlementAdapterId: adapter,
  maximumLifetimeSeconds: 86_400n,
};

test("accepts a bounded CLOB order over an explicit cross-chain asset pair", () => {
  assert.deepEqual(orderPolicyErrors(order, context), []);
  assert.doesNotThrow(() => assertOrderPolicy(order, context));
});

test("rejects zero, expired, stale-epoch, excessive-fee, and unknown-venue orders", () => {
  assert.match(orderPolicyErrors({ ...order, baseAmountAtoms: 0n }, context).join(";"), /positive uint256/);
  assert.match(orderPolicyErrors({ ...order, expiry: context.nowSeconds }, context).join(";"), /future uint64/);
  assert.match(orderPolicyErrors({ ...order, accountEpoch: 2n }, context).join(";"), /not active/);
  assert.match(orderPolicyErrors({ ...order, maximumFeeBps: 31n }, context).join(";"), /exceeds 30/);
  assert.match(orderPolicyErrors({ ...order, allowedVenues: 4 }, context).join(";"), /unknown/);
  assert.match(orderPolicyErrors({ ...order, allowedVenues: 1.5 }, context).join(";"), /fractional/);
  assert.match(orderPolicyErrors({ ...order, baseAmountAtoms: "10" as unknown as bigint }, context).join(";"), /bigint/);
  assert.match(orderPolicyErrors(order, { ...context, nowSeconds: "1000000" as unknown as bigint }).join(";"), /bigint/);
});

test("enforces the exact asset-chain pair and settlement adapter", () => {
  assert.throws(() => assertOrderPolicy({ ...order, baseChainId: pair.quoteChainId }, context), /pair is not allowed/);
  assert.throws(() => assertOrderPolicy({ ...order, settlementAdapterId: adapterIdentifier("other-v1") }, context), /adapter/);
});

test("accepts case variants of the same hashed pair identifiers", () => {
  const upper = (value: Hex32) => `0x${value.slice(2).toUpperCase()}` as Hex32;
  assert.deepEqual(orderPolicyErrors({
    ...order,
    baseChainId: upper(order.baseChainId),
    baseAssetId: upper(order.baseAssetId),
    quoteChainId: upper(order.quoteChainId),
    quoteAssetId: upper(order.quoteAssetId),
    settlementAdapterId: upper(order.settlementAdapterId),
  }, context), []);
});

test("requires IOC, GTC, and FOK intents to remain price bounded", () => {
  for (const timeInForce of [0, 1, 2] as const) {
    assert.doesNotThrow(() => assertOrderPolicy({ ...order, timeInForce, limitPriceTicks: 5_000n }, context));
  }
  assert.throws(() => assertOrderPolicy({ ...order, timeInForce: 1, limitPriceTicks: 0n }, context), /positive uint256/);
});

test("rejects zero identities, zero salts, and excessive lifetimes", () => {
  const zero = `0x${"00".repeat(32)}` as Hex32;
  assert.throws(() => assertOrderPolicy({ ...order, makerAccountId: zero }, context), /cannot be zero/);
  assert.throws(() => assertOrderPolicy({ ...order, salt: zero }, context), /cannot be zero/);
  assert.throws(() => assertOrderPolicy({ ...order, expiry: context.nowSeconds + 86_401n }, context), /maximum lifetime/);
});
