import assert from "node:assert/strict";
import test from "node:test";

import { createOrderDomain, hashTypedOrder, type TypedOrderIntent } from "./eip712-order.ts";
import { createAtomicSwapPlan, type AtomicSwapParty, type AtomicSwapPolicy } from "./atomic-swap-plan.ts";
import { keccak256Text } from "./keccak.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "./order-domain.ts";
import { hash160Value, p2pkhAddress, p2shAddress } from "./zcash-address.ts";

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
  const zcashAddress = p2pkhAddress(hash160Value(new TextEncoder().encode(`zcash:${name}`)), "mainnet");
  const sourceAccount = side === 0 ? `eip155:42161:0x${side}${"1".repeat(39)}` : `zcash:mainnet:${zcashAddress}`;
  const recipientAccount = side === 0 ? `zcash:mainnet:${zcashAddress}` : `eip155:42161:0x${side}${"2".repeat(39)}`;
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
    limitPriceTicks: side === 0 ? 5_100n : 4_900n,
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

function withOrder(partyValue: AtomicSwapParty, changes: Partial<TypedOrderIntent>): AtomicSwapParty {
  const order = { ...partyValue.order, ...changes };
  return { ...partyValue, order, orderHash: hashTypedOrder(policy.orderDomain, order) };
}

test("every plan binds both parties to their signed venue permissions", () => {
  const input = {
    venue: "order-book" as const,
    fillIndex: 0,
    taker: party("venue-buyer", 0),
    counterparty: party("venue-seller", 1),
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 100_000_000n,
    feeBps: 0n,
    policy,
  };
  for (const venue of ["order-book", "solver"] as const) {
    const allowedVenues = venue === "order-book" ? 1 : 2;
    const permitted = {
      ...input, venue,
      taker: withOrder(input.taker, { allowedVenues }),
      counterparty: withOrder(input.counterparty, { allowedVenues }),
    };
    assert.equal(createAtomicSwapPlan(permitted).venue, venue);
    for (const role of ["taker", "counterparty"] as const) {
      assert.throws(() => createAtomicSwapPlan({
        ...permitted, [role]: withOrder(permitted[role], { allowedVenues: 3 - allowedVenues }),
      }), /does not authorize the selected venue/);
    }
  }
  assert.throws(() => createAtomicSwapPlan({
    ...input, counterparty: { ...input.counterparty, authorizationKind: "solver-quote", verifiedAuthorizationHash: input.counterparty.orderHash },
  }), /requires the solver venue/);
  assert.throws(() => createAtomicSwapPlan({ ...input, venue: "unknown" as "solver" }), /Unknown atomic-swap venue/);
});

test("maps a fill deterministically to direct wallet legs with ordered deadlines", () => {
  const input = {
    venue: "solver" as const,
    fillIndex: 0,
    taker: party("buyer", 0),
    counterparty: party("seller", 1),
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 100_000_000n,
    feeBps: 0n,
    policy,
  };
  const first = createAtomicSwapPlan(input);
  const second = createAtomicSwapPlan(input);
  assert.deepEqual(first, second);
  assert.equal(first.stablecoinLeg.funder, input.taker.accounts.sourceAccount);
  assert.equal(first.stablecoinLeg.claimant, input.counterparty.accounts.recipientAccount);
  assert.equal(first.zcashLeg.funder, input.counterparty.accounts.sourceAccount);
  assert.equal(first.zcashLeg.claimant, input.taker.accounts.recipientAccount);
  assert.equal(first.grossQuoteAtoms, "50000000");
  assert.equal(first.feeBps, "0");
  assert.equal(first.feeQuoteAtoms, "0");
  assert.equal(first.quoteTransferAtoms, "50000000");
  assert.equal(first.stablecoinLeg.amountAtoms, first.quoteTransferAtoms);
  assert.equal(first.hashlockDigest, null);
  assert.equal(first.hashlockStatus, "unresolved-wallet-authorization");
  assert.equal(first.hashlockCommitmentRequestId, first.stablecoinLeg.hashlockCommitmentRequestId);
  assert.equal(first.hashlockCommitmentRequestId, first.zcashLeg.hashlockCommitmentRequestId);
  assert.equal(first.execution.blockingGates.includes("per-fill-shared-hashlock-authorization"), true);
  assert.ok(BigInt(first.stablecoinLeg.refundLock.valueSeconds) < BigInt(first.zcashLeg.refundLock.valueSeconds));
});

test("uses maker-side rounding while preserving both signed limits", () => {
  const buyer = withOrder(party("rounding-buyer", 0), { baseAmountAtoms: 100_000_001n, limitPriceTicks: 5_100n });
  const seller = withOrder(party("rounding-seller", 1), { baseAmountAtoms: 100_000_001n, limitPriceTicks: 4_900n });
  const common = {
    venue: "order-book" as const,
    fillIndex: 0,
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_001n,
    baseAmountAtoms: 100_000_001n,
    feeBps: 0n,
    policy,
  };
  const sellerMaker = createAtomicSwapPlan({ ...common, taker: buyer, counterparty: seller });
  const buyerMaker = createAtomicSwapPlan({ ...common, taker: seller, counterparty: buyer });
  assert.equal(sellerMaker.quoteTransferAtoms, "50010001");
  assert.equal(buyerMaker.quoteTransferAtoms, "50010000");
});

test("deep-freezes a plan so nested bytes cannot diverge from planId", () => {
  const plan = createAtomicSwapPlan({
    venue: "solver",
    fillIndex: 0,
    taker: party("frozen-buyer", 0),
    counterparty: party("frozen-seller", 1),
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 100_000_000n,
    feeBps: 0n,
    policy,
  });
  assert.equal(Object.isFrozen(plan), true);
  assert.equal(Object.isFrozen(plan.stablecoinLeg), true);
  assert.equal(Object.isFrozen(plan.stablecoinLeg.refundLock), true);
  assert.equal(Object.isFrozen(plan.execution), true);
  assert.equal(Object.isFrozen(plan.execution.blockingGates), true);
  assert.throws(() => {
    (plan.stablecoinLeg as { amountAtoms: string }).amountAtoms = "1";
  }, TypeError);
});

test("keeps every plan no-value with no platform residual or unilateral authority", () => {
  const plan = createAtomicSwapPlan({
    venue: "order-book",
    fillIndex: 0,
    taker: party("seller", 1),
    counterparty: party("buyer", 0),
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 50_000_000n,
    feeBps: 0n,
    policy,
  });
  assert.equal(plan.platformRetainedBaseAtoms, "0");
  assert.equal(plan.platformRetainedQuoteAtoms, "0");
  assert.equal(plan.unilateralSpendingAuthority, false);
  assert.equal(plan.execution.status, "blocked");
  assert.equal(plan.stablecoinLeg.broadcast, "disabled");
  assert.equal(plan.zcashLeg.broadcast, "disabled");
  assert.equal(plan.grossQuoteAtoms, "25000000");
  assert.equal(plan.feeQuoteAtoms, "0");
  assert.equal(plan.quoteTransferAtoms, "25000000");
  assert.equal(JSON.stringify(plan).includes("preimage"), false);
  assert.equal(JSON.stringify(plan).includes("privateKey"), false);
  assert.equal(JSON.stringify(plan).includes("transactionBytes"), false);
});

test("rejects account substitution, same-side fills, and pair confusion", () => {
  const taker = party("buyer", 0);
  const counterparty = party("seller", 1);
  const base = {
    venue: "solver" as const,
    fillIndex: 0,
    taker,
    counterparty,
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 1n,
    feeBps: 0n,
    policy,
  };
  assert.throws(() => createAtomicSwapPlan({
    ...base,
    taker: { ...taker, accounts: { ...taker.accounts, recipientAccount: "zcash:mainnet:t3attacker" } },
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
    fillIndex: 0,
    taker: party("buyer", 0),
    counterparty: party("seller", 1),
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 1n,
    feeBps: 0n,
    policy,
  };
  assert.throws(() => createAtomicSwapPlan({ ...input, acceptedAtSeconds: 499_999_999n }), /timestamp-style/);
  assert.throws(() => createAtomicSwapPlan({ ...input, fillIndex: 128 }), /Fill index/);
  assert.throws(() => createAtomicSwapPlan({ ...input, policy: { ...policy, zcashRequiredConfirmations: 0 } }), /positive bounded/);
  assert.throws(() => createAtomicSwapPlan({
    ...input,
    policy: { ...policy, pair: { ...policy.pair, base: { ...policy.pair.base, decimals: 18 } } },
  }), /8-decimal/);
});

test("derives quote amounts and ignores any caller-supplied notional", () => {
  const buyer = party("notional-buyer", 0);
  const seller = party("notional-seller", 1);
  const plan = createAtomicSwapPlan({
    venue: "solver",
    fillIndex: 0,
    taker: buyer,
    counterparty: seller,
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 100_000_000n,
    feeBps: 0n,
    policy,
    // A legacy notional must not be accepted as an input or affect the plan.
    quoteTransferAtoms: 1n,
  } as Parameters<typeof createAtomicSwapPlan>[0] & { quoteTransferAtoms: bigint });
  assert.equal(plan.quoteTransferAtoms, "50000000");
  assert.equal(plan.stablecoinLeg.amountAtoms, "50000000");
});

test("rejects positive protocol fees and integer quote rounding outside signed limits", () => {
  const buyer = party("limit-buyer", 0);
  const seller = party("limit-seller", 1);
  const base = {
    venue: "order-book" as const,
    fillIndex: 0,
    taker: buyer,
    counterparty: seller,
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_291n,
    baseAmountAtoms: 1n,
    feeBps: 0n,
    policy,
  };
  const roundedBuyer = withOrder(buyer, { baseAmountAtoms: 1n, limitPriceTicks: 5_291n });
  const roundedSeller = withOrder(seller, { baseAmountAtoms: 1n, limitPriceTicks: 5_291n });
  assert.throws(() => createAtomicSwapPlan({ ...base, taker: roundedBuyer, counterparty: roundedSeller }), /signed limits/);

  assert.throws(() => createAtomicSwapPlan({
    ...base,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 100_000_000n,
    feeBps: 5n,
  }), /zero protocol fee/);
});

test("rejects quote dust instead of producing a zero-value stablecoin leg", () => {
  const buyer = withOrder(party("dust-buyer", 0), { baseAmountAtoms: 1n, limitPriceTicks: 1n });
  const seller = withOrder(party("dust-seller", 1), { baseAmountAtoms: 1n, limitPriceTicks: 1n });
  assert.throws(() => createAtomicSwapPlan({
    venue: "order-book",
    fillIndex: 0,
    taker: seller,
    counterparty: buyer,
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 1n,
    baseAmountAtoms: 1n,
    feeBps: 0n,
    policy,
  }), /dust/);
});

test("gives each partial fill a unique deterministic shared commitment request ID", () => {
  const input = {
    venue: "solver" as const,
    taker: party("partial-buyer", 0),
    counterparty: party("partial-seller", 1),
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    feeBps: 0n,
    policy,
  };
  const first = createAtomicSwapPlan({ ...input, fillIndex: 0, baseAmountAtoms: 40_000_000n });
  const second = createAtomicSwapPlan({ ...input, fillIndex: 1, baseAmountAtoms: 60_000_000n });
  assert.notEqual(first.hashlockCommitmentRequestId, second.hashlockCommitmentRequestId);
  assert.equal(first.hashlockCommitmentRequestId, first.stablecoinLeg.hashlockCommitmentRequestId);
  assert.equal(first.hashlockCommitmentRequestId, first.zcashLeg.hashlockCommitmentRequestId);
  assert.equal(first.hashlockDigest, null);
  assert.equal(first.stablecoinLeg.hashlockDigest, null);
  assert.equal(first.zcashLeg.hashlockDigest, null);
});

test("does not reinterpret the signed order salt as a hashlock digest", () => {
  const taker = party("salt-buyer", 0);
  const counterparty = party("salt-seller", 1);
  const plan = createAtomicSwapPlan({
    venue: "solver",
    fillIndex: 0,
    taker,
    counterparty,
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 100_000_000n,
    feeBps: 0n,
    policy,
  });
  assert.equal(plan.hashlockDigest, null);
  assert.equal(plan.stablecoinLeg.hashlockDigest, null);
  assert.equal(plan.zcashLeg.hashlockDigest, null);
  assert.notEqual(plan.hashlockCommitmentRequestId, taker.order.salt);
  assert.equal(plan.hashlockStatus, "unresolved-wallet-authorization");
});

test("rejects account-role and exact-network mismatches even when signed IDs match", () => {
  const buyer = party("role-buyer", 0);
  const seller = party("role-seller", 1);
  const wrongSource = "eip155:1:0x1111111111111111111111111111111111111111";
  const wrongOrder = { ...buyer.order, makerAccountId: accountIdentifier(wrongSource) };
  const wrongBuyer = {
    ...buyer,
    order: wrongOrder,
    orderHash: hashTypedOrder(policy.orderDomain, wrongOrder),
    accounts: { ...buyer.accounts, sourceAccount: wrongSource },
  };
  assert.throws(() => createAtomicSwapPlan({
    venue: "order-book",
    fillIndex: 0,
    taker: wrongBuyer,
    counterparty: seller,
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 100_000_000n,
    feeBps: 0n,
    policy,
  }), /exact eip155:42161 network/);

  const wrongZcash = `zcash:testnet:${p2shAddress(hash160Value(new TextEncoder().encode("wrong-network")), "mainnet")}`;
  const wrongSellerOrder = { ...seller.order, makerAccountId: accountIdentifier(wrongZcash) };
  const wrongSeller = {
    ...seller,
    order: wrongSellerOrder,
    orderHash: hashTypedOrder(policy.orderDomain, wrongSellerOrder),
    accounts: { ...seller.accounts, sourceAccount: wrongZcash },
  };
  assert.throws(() => createAtomicSwapPlan({
    venue: "order-book",
    fillIndex: 0,
    taker: buyer,
    counterparty: wrongSeller,
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 100_000_000n,
    feeBps: 0n,
    policy,
  }), /transparent mainnet Zcash account/);
});
