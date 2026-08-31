import assert from "node:assert/strict";
import test from "node:test";

import type { TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import { planPriceTimeMatches, type SequencedOrder } from "./price-time.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "./order-domain.ts";

const pair = {
  baseChainId: chainIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d"),
  baseAssetId: assetIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133"),
  quoteChainId: chainIdentifier("eip155:42161"),
  quoteAssetId: assetIdentifier("eip155:42161/erc20:0x2222222222222222222222222222222222222222"),
  settlementAdapterId: adapterIdentifier("no-value-reference-v1"),
};

function intent(name: string, side: 0 | 1, price: bigint, amount: bigint, timeInForce: 0 | 1 | 2 = 0): TypedOrderIntent {
  return {
    makerAccountId: accountIdentifier(`session:${name}`),
    authorizedSignerId: accountIdentifier(`session:${name}:signer`),
    recipientAccountId: accountIdentifier(`session:${name}:recipient`),
    ...pair,
    side,
    baseAmountAtoms: amount,
    limitPriceTicks: price,
    nonce: 1n,
    accountEpoch: 0n,
    expiry: 10_000n,
    salt: keccak256Text(`${name}:salt`),
    timeInForce,
    maximumFeeBps: 30n,
    allowedVenues: 1,
  };
}

function sequenced(name: string, sequence: bigint, order: TypedOrderIntent, remaining = order.baseAmountAtoms): SequencedOrder {
  return { orderHash: keccak256Text(name), sequence, order, remainingBaseAtoms: remaining };
}

test("selects the best sell price before earlier worse prices", () => {
  const taker = sequenced("buy", 4n, intent("buy", 0, 5_300n, 15n, 1));
  const plan = planPriceTimeMatches(taker, [
    sequenced("older-worse", 1n, intent("older-worse", 1, 5_300n, 10n)),
    sequenced("newer-better", 2n, intent("newer-better", 1, 5_200n, 10n)),
  ]);
  assert.deepEqual(plan.fills.map((fill) => fill.executionPriceTicks), [5_200n, 5_300n]);
  assert.equal(plan.status, "filled");
});

test("uses intake sequence as the tie-breaker at one price", () => {
  const taker = sequenced("buy", 4n, intent("buy", 0, 5_300n, 15n, 1));
  const plan = planPriceTimeMatches(taker, [
    sequenced("new", 2n, intent("new", 1, 5_200n, 10n)),
    sequenced("old", 1n, intent("old", 1, 5_200n, 10n)),
  ]);
  assert.equal(plan.fills[0]?.makerOrderHash, keccak256Text("old"));
  assert.equal(plan.fills[1]?.baseAmountAtoms, 5n);
});

test("never crosses outside the taker limit or against its own account", () => {
  const buyOrder = intent("buy", 0, 5_200n, 10n, 1);
  const taker = sequenced("buy", 5n, buyOrder);
  const plan = planPriceTimeMatches(taker, [
    sequenced("too-expensive", 1n, intent("too-expensive", 1, 5_201n, 10n)),
    sequenced("self", 2n, { ...intent("self", 1, 5_100n, 10n), makerAccountId: buyOrder.makerAccountId }),
  ]);
  assert.equal(plan.status, "unfilled");
});

test("rejects FOK atomically when full size is unavailable", () => {
  const taker = sequenced("buy", 3n, intent("buy", 0, 5_300n, 20n, 2));
  const plan = planPriceTimeMatches(taker, [sequenced("sell", 1n, intent("sell", 1, 5_200n, 10n))]);
  assert.deepEqual(plan, { fills: [], remainingBaseAtoms: 20n, status: "fok-rejected" });
});

test("does not mix asset-chain pairs or accept non-resting IOC makers", () => {
  const taker = sequenced("buy", 4n, intent("buy", 0, 5_300n, 10n, 1));
  const otherPair = { ...intent("other", 1, 5_200n, 10n), baseChainId: pair.quoteChainId };
  const iocMaker = intent("ioc", 1, 5_100n, 10n, 1);
  assert.equal(planPriceTimeMatches(taker, [sequenced("other", 1n, otherPair), sequenced("ioc", 2n, iocMaker)]).fills.length, 0);
});

test("rejects duplicate maker hashes and case-variant self trades", () => {
  const buyOrder = intent("buy", 0, 5_300n, 10n, 1);
  const taker = sequenced("buy", 4n, buyOrder);
  const duplicate = sequenced("duplicate", 1n, intent("seller", 1, 5_200n, 5n));
  assert.throws(
    () => planPriceTimeMatches(taker, [duplicate, { ...duplicate, sequence: 2n, orderHash: `0x${duplicate.orderHash.slice(2).toUpperCase()}` }]),
    /duplicated/,
  );
  const caseVariantSelf = {
    ...intent("self", 1, 5_200n, 10n),
    makerAccountId: `0x${buyOrder.makerAccountId.slice(2).toUpperCase()}`,
  } as TypedOrderIntent;
  assert.equal(planPriceTimeMatches(taker, [sequenced("self", 1n, caseVariantSelf)]).fills.length, 0);
});

test("rejects duplicate intake sequences even across different prices", () => {
  const taker = sequenced("buy", 4n, intent("buy", 0, 5_300n, 10n, 1));
  assert.throws(
    () => planPriceTimeMatches(taker, [
      sequenced("seller-a", 1n, intent("seller-a", 1, 5_200n, 5n)),
      sequenced("seller-b", 1n, intent("seller-b", 1, 5_250n, 5n)),
    ]),
    /sequence is duplicated/,
  );
});

test("rejects maker identity collisions with the taker intake", () => {
  const taker = sequenced("buy", 4n, intent("buy", 0, 5_300n, 10n, 1));
  const maker = sequenced("seller", 1n, intent("seller", 1, 5_200n, 10n));
  assert.throws(() => planPriceTimeMatches(taker, [{ ...maker, sequence: taker.sequence }]), /sequence is duplicated/);
  assert.throws(() => planPriceTimeMatches(taker, [{ ...maker, orderHash: taker.orderHash }]), /order hash is duplicated/);
});
