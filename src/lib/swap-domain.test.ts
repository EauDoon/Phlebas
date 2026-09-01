import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import {
  createAtomicSwapPlan,
  type AtomicSwapParty,
  type AtomicSwapPolicy,
} from "./atomic-swap-plan.ts";
import { createOrderDomain, hashTypedOrder, type TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import {
  accountIdentifier,
  adapterIdentifier,
  assetIdentifier,
  chainIdentifier,
} from "./order-domain.ts";
import {
  adaptMatchedOrderPairToSwapTerms,
  encodeSwapTerms,
  hashSwapTerms,
  swapIdForTerms,
  swapTermsFromAtomicSwapPlan,
  validateSignedSwapTerms,
  validateSwapTerms,
} from "./swap-domain.ts";

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
  const zcashAddress = `t3${keccak256Text(`zcash:${name}`).slice(2).replaceAll("0", "a").slice(0, 33)}`;
  const sourceAccount = side === 0
    ? `eip155:42161:0x${side}${"1".repeat(39)}`
    : `zcash:mainnet:${zcashAddress}`;
  const recipientAccount = side === 0
    ? `zcash:mainnet:${zcashAddress}`
    : `eip155:42161:0x${side}${"2".repeat(39)}`;
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
  return {
    orderHash: hashTypedOrder(policy.orderDomain, order),
    order,
    accounts: { sourceAccount, recipientAccount },
  };
}

function input(overrides: Partial<Parameters<typeof adaptMatchedOrderPairToSwapTerms>[0]> = {}) {
  return {
    venue: "solver" as const,
    fillIndex: 0,
    taker: party("buyer", 0),
    counterparty: party("seller", 1),
    acceptedAtSeconds: 1_800_000_000n,
    executionPriceTicks: 5_000n,
    baseAmountAtoms: 100_000_000n,
    feeBps: 10n,
    policy,
    ...overrides,
  };
}

test("adapts a matched pair to deterministic immutable no-value terms", () => {
  const first = adaptMatchedOrderPairToSwapTerms(input());
  const second = adaptMatchedOrderPairToSwapTerms(input());

  assert.deepEqual(first, second);
  assert.match(first.swapId, /^0x[0-9a-f]{64}$/);
  assert.match(first.termsHash, /^0x[0-9a-f]{64}$/);
  assert.equal(first.termsHash, `0x${createHash("sha256").update(encodeSwapTerms(first.terms), "utf8").digest("hex")}`);
  assert.equal(first.swapId, swapIdForTerms(first.terms));
  assert.equal(first.terms.execution.mode, "no-value");
  assert.equal(first.terms.execution.status, "blocked");
  assert.equal(first.terms.platformRetainedBaseAtoms, "0");
  assert.equal(first.terms.platformRetainedQuoteAtoms, "0");
  assert.equal(first.terms.unilateralSpendingAuthority, false);
  assert.equal(first.terms.hashBinding.evm.algorithm, "sha256");
  assert.equal(first.terms.hashBinding.evm.digestLengthBytes, 32);
  assert.equal(first.terms.hashBinding.evm.digest, null);
  assert.equal(first.terms.hashBinding.zcash.algorithm, "hash160");
  assert.equal(first.terms.hashBinding.zcash.digestLengthBytes, 20);
  assert.equal(first.terms.hashBinding.zcash.digest, null);
  assert.equal(first.terms.hashBinding.requestId, first.terms.hashlockCommitmentRequestId);
  assert.equal(first.terms.stablecoinLeg.broadcast, "disabled");
  assert.equal(first.terms.zcashLeg.broadcast, "disabled");
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.terms), true);
  assert.equal(Object.isFrozen(first.terms.execution.blockingGates), true);
  assert.equal(Object.isFrozen(first.terms.stablecoinLeg), true);
  assert.equal(Object.isFrozen(first.terms.zcashLeg.refundLock), true);
  assert.deepEqual(validateSignedSwapTerms(first), first);
});

test("binds identifiers to the complete matched fill, not just the order pair", () => {
  const first = adaptMatchedOrderPairToSwapTerms(input());
  const differentFill = adaptMatchedOrderPairToSwapTerms(input({ fillIndex: 1 }));
  const differentAmount = adaptMatchedOrderPairToSwapTerms(input({ baseAmountAtoms: 50_000_000n }));

  assert.notEqual(first.termsHash, differentFill.termsHash);
  assert.notEqual(first.swapId, differentFill.swapId);
  assert.notEqual(first.termsHash, differentAmount.termsHash);
  assert.notEqual(first.swapId, differentAmount.swapId);
  assert.equal(hashSwapTerms(first.terms), first.termsHash);
});

test("fails closed on malformed, substituted, or value-bearing terms", () => {
  const artifact = adaptMatchedOrderPairToSwapTerms(input());
  const terms = artifact.terms;

  assert.throws(() => adaptMatchedOrderPairToSwapTerms({
    ...input(),
    counterparty: party("another-buyer", 0),
  }), /opposite sides/);
  assert.throws(() => validateSwapTerms({
    ...terms,
    hashlockDigest: "0x1111111111111111111111111111111111111111111111111111111111111111",
  }), /wallet authorization/);
  assert.throws(() => validateSwapTerms({
    ...terms,
    hashBinding: {
      ...terms.hashBinding,
      zcash: { ...terms.hashBinding.zcash, algorithm: "sha256" },
    },
  } as unknown as typeof terms), /canonical/);
  assert.throws(() => validateSwapTerms({
    ...terms,
    execution: {
      ...terms.execution,
      blockingGates: terms.execution.blockingGates.slice(1),
    },
  } as unknown as typeof terms), /every no-value blocking gate/);
  assert.throws(() => validateSwapTerms({
    ...terms,
    stablecoinLeg: { ...terms.stablecoinLeg, amountAtoms: "1" },
  }), /canonical fill amounts/);
  assert.throws(() => validateSwapTerms({
    ...terms,
    feeQuoteAtoms: (BigInt(terms.feeQuoteAtoms) + 1n).toString(),
  }), /fee does not match/);
  assert.throws(() => validateSignedSwapTerms({
    ...artifact,
    termsHash: "0x2222222222222222222222222222222222222222222222222222222222222222",
  }), /terms hash/);
  assert.throws(() => validateSignedSwapTerms({
    ...artifact,
    terms: { ...terms, preimage: "0x3333333333333333333333333333333333333333333333333333333333333333" },
  } as unknown as typeof artifact), /unknown field/);

  const serialized = JSON.stringify(artifact);
  assert.equal(serialized.includes("preimage"), false);
  assert.equal(serialized.includes("privateKey"), false);
  assert.equal(serialized.includes("signature"), false);
  assert.equal(serialized.includes("transactionBytes"), false);
  assert.equal(serialized.includes("custody"), false);
});

test("canonical encoding is unambiguous for delimiter-bearing policy text", () => {
  const artifact = adaptMatchedOrderPairToSwapTerms(input());
  const terms = validateSwapTerms({
    ...artifact.terms,
    settlementProtocolVersion: "proto|field=value,gate:status",
  });
  const [domain, json] = encodeSwapTerms(terms).split("\n", 2);

  assert.equal(domain, "PhlebasSwapTerms");
  assert.equal(JSON.parse(json).settlementProtocolVersion, "proto|field=value,gate:status");
  assert.notEqual(hashSwapTerms(terms), artifact.termsHash);
});

test("bridges only a validated atomic-swap plan and keeps the same canonical IDs", () => {
  const matched = input();
  const plan = createAtomicSwapPlan(matched);
  const fromPair = adaptMatchedOrderPairToSwapTerms(matched);
  const fromPlan = swapTermsFromAtomicSwapPlan(plan);

  assert.deepEqual(fromPlan, fromPair);
});
