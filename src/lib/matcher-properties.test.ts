import assert from "node:assert/strict";
import test from "node:test";

import type { TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "./order-domain.ts";
import { planPriceTimeMatches, type SequencedOrder } from "./price-time.ts";
import { QUOTE_COST_DIVISOR, quoteAtomsForFill } from "./units.ts";

const pair = {
  baseChainId: chainIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d"),
  baseAssetId: assetIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133"),
  quoteChainId: chainIdentifier("eip155:42161"),
  quoteAssetId: assetIdentifier("eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831"),
  settlementAdapterId: adapterIdentifier("transparent-htlc-v1"),
};

function generator(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (Math.imul(value, 1_664_525) + 1_013_904_223) >>> 0;
    return value;
  };
}

function intent(name: string, side: 0 | 1, price: bigint, amount: bigint, timeInForce: 0 | 1 | 2): TypedOrderIntent {
  return {
    makerAccountId: accountIdentifier(`property:${name}`),
    authorizedSignerId: accountIdentifier(`property:${name}:signer`),
    recipientAccountId: accountIdentifier(`property:${name}:recipient`),
    ...pair,
    side,
    baseAmountAtoms: amount,
    limitPriceTicks: price,
    nonce: 1n,
    accountEpoch: 0n,
    expiry: 10_000n,
    salt: keccak256Text(`property:${name}:salt`),
    timeInForce,
    maximumFeeBps: 30n,
    allowedVenues: 1,
  };
}

function sequenced(name: string, sequence: bigint, order: TypedOrderIntent): SequencedOrder {
  return { orderHash: keccak256Text(`property:${name}`), sequence, order, remainingBaseAtoms: order.baseAmountAtoms };
}

test("price-time plans preserve ordering, conservation, no-overfill, and permutation determinism", () => {
  const random = generator(0x50484c45);
  for (let scenario = 0; scenario < 500; scenario += 1) {
    const side = (random() & 1) as 0 | 1;
    const limit = BigInt(4_800 + (random() % 401));
    const amount = BigInt(1 + (random() % 10_000));
    const timeInForce = (random() % 3) as 0 | 1 | 2;
    const makerCount = 1 + (random() % 24);
    const taker = sequenced(`taker-${scenario}`, BigInt(makerCount + 1), intent(`taker-${scenario}`, side, limit, amount, timeInForce));
    const makers = Array.from({ length: makerCount }, (_, index) => {
      const price = BigInt(4_700 + (random() % 601));
      const capacity = BigInt(1 + (random() % 2_000));
      return sequenced(
        `maker-${scenario}-${index}`,
        BigInt(index + 1),
        intent(`maker-${scenario}-${index}`, side === 0 ? 1 : 0, price, capacity, 0),
      );
    });
    const shuffled = makers.map((value) => ({ value, key: random() })).sort((left, right) => left.key - right.key).map(({ value }) => value);
    const plan = planPriceTimeMatches(taker, shuffled);
    const repeated = planPriceTimeMatches(taker, [...shuffled].reverse());
    assert.deepEqual(plan, repeated);

    if (plan.status === "fok-rejected") {
      assert.deepEqual(plan.fills, []);
      assert.equal(plan.remainingBaseAtoms, amount);
      continue;
    }
    const filled = plan.fills.reduce((total, fill) => total + fill.baseAmountAtoms, 0n);
    assert.equal(filled + plan.remainingBaseAtoms, amount);
    assert.ok(filled <= amount);
    assert.equal(new Set(plan.fills.map((fill) => fill.makerOrderHash)).size, plan.fills.length);
    for (const fill of plan.fills) {
      const maker = makers.find((candidate) => candidate.orderHash === fill.makerOrderHash);
      assert.ok(maker);
      assert.ok(fill.baseAmountAtoms > 0n && fill.baseAmountAtoms <= maker.remainingBaseAtoms);
      assert.equal(fill.executionPriceTicks, maker.order.limitPriceTicks);
      assert.ok(side === 0 ? fill.executionPriceTicks <= limit : fill.executionPriceTicks >= limit);
    }
    for (let index = 1; index < plan.fills.length; index += 1) {
      const prior = plan.fills[index - 1];
      const current = plan.fills[index];
      assert.ok(prior && current);
      if (prior.executionPriceTicks === current.executionPriceTicks) assert.ok(prior.makerSequence < current.makerSequence);
      else assert.ok(side === 0 ? prior.executionPriceTicks < current.executionPriceTicks : prior.executionPriceTicks > current.executionPriceTicks);
    }
  }
});

test("integer quote rounding encloses the exact rational cost", () => {
  const random = generator(0x5a434153);
  for (let index = 0; index < 10_000; index += 1) {
    const size = (BigInt(random()) << 32n) + BigInt(random());
    const price = BigInt(1 + (random() % 1_000_000));
    const numerator = size * price;
    const down = quoteAtomsForFill(size, price, "down");
    const up = quoteAtomsForFill(size, price, "up");
    assert.ok(down * QUOTE_COST_DIVISOR <= numerator);
    assert.ok((down + 1n) * QUOTE_COST_DIVISOR > numerator);
    assert.ok(up * QUOTE_COST_DIVISOR >= numerator);
    assert.ok(up === down || up === down + 1n);
  }
});
