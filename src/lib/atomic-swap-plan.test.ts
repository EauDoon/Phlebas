import assert from "node:assert/strict";
import test from "node:test";

import { createOrderDomain, hashTypedOrder, type TypedOrderIntent } from "./eip712-order.ts";
import { createAtomicSwapPlan, type AtomicSwapParty, type AtomicSwapPolicy } from "./atomic-swap-plan.ts";
import { keccak256Text } from "./keccak.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "./order-domain.ts";

const policy: AtomicSwapPolicy = {
  orderDomain: createOrderDomain(42161n, "0x1111111111111111111111111111111111111111"),
  pair: {
    base: {
      network: "bip122:00040fe8ec8471911baa1db1266ea15d",
      asset: "bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133",
      environment: "mainnet",
      decimals: 8,
    },
    quote: {
      network: "eip155:42161",
      asset: "eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831",
      environment: "mainnet",
      decimals: 6,
    },
  },
  settlementProtocolVersion: "transparent-htlc-v1",
  stablecoinRefundDelaySeconds: 3_600n,
  zcashRefundSafetyDeltaSeconds: 7_200n,
  zcashRequiredConfirmations: 10,
  quoteRequiredConfirmations: 65,
};

function party(name: string, side: 0 | 1): AtomicSwapParty {
  const sourceAccount = side === 0 ? `eip155:42161:0x${side}${"1".repeat(39)}` : `zcash:mainnet:t3-${name}`;
  const recipientAccount = side === 0 ? `zcash:mainnet:t3-${name}` : `eip155:42161:0x${side}${"2".repeat(39)}`;
  const order: TypedOrderIntent = {
    makerAccountId: accountIdentifier(sourceAccount),
    authorizedSignerId: accountIdentifier(`eip155:42161:signer-${name}`),
    recipientAccountId: accountIdentifier(recipientAccount),
    baseChainId: chainIdentifier(policy.pair.base.network),
    baseAssetId: assetIdentifier(policy.pair.base.asset),
    quoteChainId: chainIdentifier(policy.pair.quote.network),
    quoteAssetId: assetIdentifier(policy.pair.quote.asset),
    side,
    baseAmountAtoms: 100_000_000n,
    limitPriceTicks: 5_000n,
    nonce: 1n,
    accountEpoch: 0n,
    expiry: 2_000_000_000n,
    salt: keccak256Text(`hashlock:${name}`),
    timeInForce: 0,
    maximumFeeBps: 30n,
    allowedVenues: 3,
    settlementAdapterId: adapterIdentifier(policy.settlementProtocolVersion),
  };
  return { orderHash: hashTypedOrder(policy.orderDomain, order), order, accounts: { sourceAccount, recipientAccount } };
}

test("maps a fill deterministically to direct wallet legs with ordered deadlines", () => {
  const input = {
    venue: "solver" as const,
    taker: party("buyer", 0),
    counterparty: party("seller", 1),
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 100_000_000n,
    quoteTransferAtoms: 50_000_000n,
    policy,
  };
  const first = createAtomicSwapPlan(input);
  const second = createAtomicSwapPlan(input);
  assert.deepEqual(first, second);
  assert.equal(first.stablecoinLeg.funder, input.taker.accounts.sourceAccount);
  assert.equal(first.stablecoinLeg.claimant, input.counterparty.accounts.recipientAccount);
  assert.equal(first.zcashLeg.funder, input.counterparty.accounts.sourceAccount);
  assert.equal(first.zcashLeg.claimant, input.taker.accounts.recipientAccount);
  assert.ok(BigInt(first.stablecoinLeg.refundLock.valueSeconds) < BigInt(first.zcashLeg.refundLock.valueSeconds));
});

test("keeps every plan no-value with no platform residual or unilateral authority", () => {
  const plan = createAtomicSwapPlan({
    venue: "order-book",
    taker: party("seller", 1),
    counterparty: party("buyer", 0),
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 50_000_000n,
    quoteTransferAtoms: 25_000_000n,
    policy,
  });
  assert.equal(plan.platformRetainedBaseAtoms, "0");
  assert.equal(plan.platformRetainedQuoteAtoms, "0");
  assert.equal(plan.unilateralSpendingAuthority, false);
  assert.equal(plan.execution.status, "blocked");
  assert.equal(plan.stablecoinLeg.broadcast, "disabled");
  assert.equal(plan.zcashLeg.broadcast, "disabled");
  assert.equal(JSON.stringify(plan).includes("preimage"), false);
  assert.equal(JSON.stringify(plan).includes("privateKey"), false);
});

test("rejects account substitution, same-side fills, and pair confusion", () => {
  const taker = party("buyer", 0);
  const counterparty = party("seller", 1);
  const base = {
    venue: "solver" as const,
    taker,
    counterparty,
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 1n,
    quoteTransferAtoms: 1n,
    policy,
  };
  assert.throws(() => createAtomicSwapPlan({
    ...base,
    taker: { ...taker, accounts: { ...taker.accounts, recipientAccount: "zcash:mainnet:t3-attacker" } },
  }), /recipient account/);
  assert.throws(() => createAtomicSwapPlan({ ...base, counterparty: party("other-buyer", 0) }), /opposite sides/);
  assert.throws(() => createAtomicSwapPlan({
    ...base,
    counterparty: {
      ...counterparty,
      order: { ...counterparty.order, quoteAssetId: assetIdentifier("eip155:42161/erc20:0x1111111111111111111111111111111111111111") },
    },
  }), /exact atomic-swap asset pair/);
});

test("requires positive confirmations and a timestamp-style absolute CLTV plan", () => {
  const input = {
    venue: "solver" as const,
    taker: party("buyer", 0),
    counterparty: party("seller", 1),
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 1n,
    quoteTransferAtoms: 1n,
    policy,
  };
  assert.throws(() => createAtomicSwapPlan({ ...input, acceptedAtSeconds: 499_999_999n }), /timestamp-style/);
  assert.throws(() => createAtomicSwapPlan({ ...input, policy: { ...policy, zcashRequiredConfirmations: 0 } }), /positive bounded/);
  assert.throws(() => createAtomicSwapPlan({
    ...input,
    policy: { ...policy, pair: { ...policy.pair, base: { ...policy.pair.base, decimals: 18 } } },
  }), /8-decimal/);
});
