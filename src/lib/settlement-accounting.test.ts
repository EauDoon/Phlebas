import assert from "node:assert/strict";
import test from "node:test";

import type { TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import { claimOrderNonce, emptyOrderLifecycle } from "./order-lifecycle.ts";
import { UINT256_MAX, accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier, type Hex32 } from "./order-domain.ts";
import type { PlannedFill, SequencedOrder } from "./price-time.ts";
import { balanceOf, createSettlementLedger, settlePlannedFill } from "./settlement-accounting.ts";

const sellerId = accountIdentifier("session:seller");
const buyerId = accountIdentifier("session:buyer");
const treasuryId = accountIdentifier("session:treasury");
const pair = {
  baseChainId: chainIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d"),
  baseAssetId: assetIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133"),
  quoteChainId: chainIdentifier("eip155:42161"),
  quoteAssetId: assetIdentifier("eip155:42161/erc20:0x2222222222222222222222222222222222222222"),
  settlementAdapterId: adapterIdentifier("no-value-reference-v1"),
};

function intent(account: typeof sellerId, side: 0 | 1, price: bigint, amount: bigint, nonce: bigint): TypedOrderIntent {
  return {
    makerAccountId: account,
    authorizedSignerId: accountIdentifier(`${account}:signer`),
    recipientAccountId: account,
    ...pair,
    side,
    baseAmountAtoms: amount,
    limitPriceTicks: price,
    nonce,
    accountEpoch: 0n,
    expiry: 10_000n,
    salt: keccak256Text(`${account}:${nonce}:salt`),
    timeInForce: 0,
    maximumFeeBps: 30n,
    allowedVenues: 1,
  };
}

const sellerOrder = intent(sellerId, 1, 5_000n, 100_000_000n, 1n);
const buyerOrder = intent(buyerId, 0, 5_100n, 100_000_000n, 1n);
const maker: SequencedOrder = { orderHash: keccak256Text("seller-order"), sequence: 1n, order: sellerOrder, remainingBaseAtoms: 100_000_000n };
const taker: SequencedOrder = { orderHash: keccak256Text("buyer-order"), sequence: 2n, order: buyerOrder, remainingBaseAtoms: 100_000_000n };
const fill: PlannedFill = { makerOrderHash: maker.orderHash, takerOrderHash: taker.orderHash, makerSequence: 1n, executionPriceTicks: 5_000n, baseAmountAtoms: 100_000_000n };
const parameters = { nowSeconds: 9_000n, quoteCostDivisor: 10_000n, makerFeeBps: 5n, takerFeeBps: 15n, feeRecipientAccountId: treasuryId };

function lifecycle() {
  const makerClaimed = claimOrderNonce(emptyOrderLifecycle(), maker.orderHash, maker.order);
  return claimOrderNonce(makerClaimed, taker.orderHash, taker.order);
}

test("settles exact base, quote, and fee atoms without changing aggregate balances", () => {
  const ledger = createSettlementLedger({
    [sellerId]: { baseAtoms: 100_000_000n, quoteAtoms: 0n },
    [buyerId]: { baseAtoms: 0n, quoteAtoms: 60_000_000n },
    [treasuryId]: { baseAtoms: 0n, quoteAtoms: 0n },
  });
  const applied = settlePlannedFill(ledger, lifecycle(), fill, maker, taker, parameters);
  assert.equal(applied.quoteAmountAtoms, 50_000_000n);
  assert.equal(applied.sellerFeeAtoms, 25_000n);
  assert.equal(applied.buyerFeeAtoms, 75_000n);
  assert.deepEqual(balanceOf(applied.ledger, sellerId), { baseAtoms: 0n, quoteAtoms: 49_975_000n });
  assert.deepEqual(balanceOf(applied.ledger, buyerId), { baseAtoms: 100_000_000n, quoteAtoms: 9_925_000n });
  assert.deepEqual(balanceOf(applied.ledger, treasuryId), { baseAtoms: 0n, quoteAtoms: 100_000n });
});

test("rejects a fill when no integer quote amount preserves both signed limits", () => {
  const tinySeller = { ...maker, order: { ...maker.order, baseAmountAtoms: 1n, limitPriceTicks: 5_291n }, remainingBaseAtoms: 1n };
  const tinyBuyer = { ...taker, order: { ...taker.order, baseAmountAtoms: 1n, limitPriceTicks: 5_291n }, remainingBaseAtoms: 1n };
  const tinyFill = { ...fill, executionPriceTicks: 5_291n, baseAmountAtoms: 1n };
  let state = claimOrderNonce(emptyOrderLifecycle(), tinySeller.orderHash, tinySeller.order);
  state = claimOrderNonce(state, tinyBuyer.orderHash, tinyBuyer.order);
  assert.throws(
    () => settlePlannedFill(createSettlementLedger(), state, tinyFill, tinySeller, tinyBuyer, parameters),
    /preserve both signed limits/,
  );
});

test("enforces signed fee caps and available balances", () => {
  const lowCapMaker = { ...maker, order: { ...maker.order, maximumFeeBps: 4n } };
  let state = claimOrderNonce(emptyOrderLifecycle(), lowCapMaker.orderHash, lowCapMaker.order);
  state = claimOrderNonce(state, taker.orderHash, taker.order);
  assert.throws(() => settlePlannedFill(createSettlementLedger(), state, fill, lowCapMaker, taker, parameters), /Maker fee/);
  assert.throws(
    () => settlePlannedFill(createSettlementLedger({ [sellerId]: { baseAtoms: 0n, quoteAtoms: 0n } }), lifecycle(), fill, maker, taker, parameters),
    /insufficient/,
  );
});

test("rejects overfills, stale remaining amounts, and inactive orders", () => {
  const ledger = createSettlementLedger();
  assert.throws(() => settlePlannedFill(ledger, lifecycle(), { ...fill, baseAmountAtoms: 100_000_001n }, maker, taker, parameters), /overfilled/);
  assert.throws(() => settlePlannedFill(ledger, lifecycle(), fill, { ...maker, remainingBaseAtoms: 1n }, taker, parameters), /does not reconcile/);
  assert.throws(() => settlePlannedFill(ledger, lifecycle(), fill, maker, taker, { ...parameters, nowSeconds: 10_000n }), /not active: expired/);
});

test("rejects corrupted prior fill and remaining state", () => {
  const negativeFilled = { ...createSettlementLedger(), filledBaseAtoms: { [maker.orderHash]: -1n } };
  const excessiveFilled = { ...createSettlementLedger(), filledBaseAtoms: { [maker.orderHash]: maker.order.baseAmountAtoms + 1n } };
  assert.throws(
    () => settlePlannedFill(negativeFilled, lifecycle(), { ...fill, baseAmountAtoms: 1n }, { ...maker, remainingBaseAtoms: maker.order.baseAmountAtoms + 1n }, taker, parameters),
    /Prior filled amount must fit/,
  );
  assert.throws(() => settlePlannedFill(excessiveFilled, lifecycle(), fill, maker, taker, parameters), /prior filled amount is outside/);
  assert.throws(
    () => settlePlannedFill(createSettlementLedger(), lifecycle(), fill, { ...maker, remainingBaseAtoms: -1n }, taker, parameters),
    /remaining amount is outside/,
  );
});

test("records fill progress and rejects replayed state transitions", () => {
  const ledger = createSettlementLedger({
    [sellerId]: { baseAtoms: 100_000_000n, quoteAtoms: 0n },
    [buyerId]: { baseAtoms: 0n, quoteAtoms: 60_000_000n },
  });
  const applied = settlePlannedFill(ledger, lifecycle(), fill, maker, taker, parameters);
  assert.equal(applied.ledger.filledBaseAtoms[maker.orderHash], 100_000_000n);
  assert.throws(() => settlePlannedFill(applied.ledger, lifecycle(), fill, maker, taker, parameters), /does not reconcile/);
});

test("rejects changed signed fields before applying settlement", () => {
  const changedMaker = {
    ...maker,
    order: { ...maker.order, recipientAccountId: accountIdentifier("session:attacker") },
  };
  assert.throws(
    () => settlePlannedFill(createSettlementLedger(), lifecycle(), fill, changedMaker, taker, parameters),
    /body-mismatch/,
  );
});

test("canonicalizes order hashes so case variants cannot split fill state", () => {
  const upper = (value: Hex32) => `0x${value.slice(2).toUpperCase()}` as Hex32;
  const upperMaker = { ...maker, orderHash: upper(maker.orderHash) };
  const upperTaker = { ...taker, orderHash: upper(taker.orderHash) };
  const upperFill = { ...fill, makerOrderHash: upper(fill.makerOrderHash), takerOrderHash: upper(fill.takerOrderHash) };
  const ledger = createSettlementLedger({
    [sellerId]: { baseAtoms: 100_000_000n, quoteAtoms: 0n },
    [buyerId]: { baseAtoms: 0n, quoteAtoms: 60_000_000n },
  });
  const applied = settlePlannedFill(ledger, lifecycle(), upperFill, upperMaker, upperTaker, parameters);
  assert.deepEqual(Object.keys(applied.ledger.filledBaseAtoms).sort(), [maker.orderHash, taker.orderHash].sort());
  assert.throws(() => settlePlannedFill(applied.ledger, lifecycle(), fill, maker, taker, parameters), /does not reconcile/);
});

test("rounds sub-atom fees down to preserve the signed basis-point cap", () => {
  const tinySeller = { ...maker, order: { ...maker.order, baseAmountAtoms: 1n, limitPriceTicks: 1n }, remainingBaseAtoms: 1n };
  const tinyBuyer = { ...taker, order: { ...taker.order, baseAmountAtoms: 1n, limitPriceTicks: 1n }, remainingBaseAtoms: 1n };
  const tinyFill = { ...fill, executionPriceTicks: 1n, baseAmountAtoms: 1n };
  let state = claimOrderNonce(emptyOrderLifecycle(), tinySeller.orderHash, tinySeller.order);
  state = claimOrderNonce(state, tinyBuyer.orderHash, tinyBuyer.order);
  const applied = settlePlannedFill(
    createSettlementLedger({
      [sellerId]: { baseAtoms: 1n, quoteAtoms: 0n },
      [buyerId]: { baseAtoms: 0n, quoteAtoms: 1n },
    }),
    state,
    tinyFill,
    tinySeller,
    tinyBuyer,
    { ...parameters, quoteCostDivisor: 1n, makerFeeBps: 1n, takerFeeBps: 1n },
  );
  assert.equal(applied.sellerFeeAtoms, 0n);
  assert.equal(applied.buyerFeeAtoms, 0n);
});

test("rejects quote and balance values outside uint256", () => {
  const hugeSeller = { ...maker, order: { ...maker.order, baseAmountAtoms: UINT256_MAX, limitPriceTicks: UINT256_MAX }, remainingBaseAtoms: UINT256_MAX };
  const hugeBuyer = { ...taker, order: { ...taker.order, baseAmountAtoms: UINT256_MAX, limitPriceTicks: UINT256_MAX }, remainingBaseAtoms: UINT256_MAX };
  const hugeFill = { ...fill, executionPriceTicks: UINT256_MAX, baseAmountAtoms: UINT256_MAX };
  let state = claimOrderNonce(emptyOrderLifecycle(), hugeSeller.orderHash, hugeSeller.order);
  state = claimOrderNonce(state, hugeBuyer.orderHash, hugeBuyer.order);
  assert.throws(
    () => settlePlannedFill(createSettlementLedger(), state, hugeFill, hugeSeller, hugeBuyer, { ...parameters, quoteCostDivisor: 1n }),
    /exceeds uint256/,
  );
  assert.throws(() => createSettlementLedger({ [sellerId]: { baseAtoms: UINT256_MAX + 1n, quoteAtoms: 0n } }), /fit uint256/);
});

test("rejects duplicate normalized balance accounts", () => {
  const upperSeller = `0x${sellerId.slice(2).toUpperCase()}` as Hex32;
  assert.throws(() => createSettlementLedger({
    [sellerId]: { baseAtoms: 1n, quoteAtoms: 0n },
    [upperSeller]: { baseAtoms: 1n, quoteAtoms: 0n },
  }), /duplicated after normalization/);
});

test("normalizes persisted ledger keys without splitting fill or replay state", () => {
  const upper = (value: Hex32) => `0x${value.slice(2).toUpperCase()}` as Hex32;
  const partialMaker = { ...maker, remainingBaseAtoms: maker.order.baseAmountAtoms - 5n };
  const partialTaker = { ...taker, remainingBaseAtoms: taker.order.baseAmountAtoms - 5n };
  const ledger: ReturnType<typeof createSettlementLedger> = {
    balances: {
      [upper(sellerId)]: { baseAtoms: 100_000_000n, quoteAtoms: 0n },
      [upper(buyerId)]: { baseAtoms: 0n, quoteAtoms: 60_000_000n },
    },
    filledBaseAtoms: { [upper(maker.orderHash)]: 5n, [upper(taker.orderHash)]: 5n },
    appliedFillIds: {},
  };
  const applied = settlePlannedFill(ledger, lifecycle(), { ...fill, baseAmountAtoms: 10_000n }, partialMaker, partialTaker, parameters);
  assert.equal(applied.ledger.filledBaseAtoms[maker.orderHash], 10_005n);
  assert.equal(Object.keys(applied.ledger.filledBaseAtoms).some((key) => /[A-F]/.test(key)), false);

  const replayLedger = { ...ledger, appliedFillIds: { [upper(applied.fillId)]: true as const } };
  assert.throws(
    () => settlePlannedFill(replayLedger, lifecycle(), { ...fill, baseAmountAtoms: 10_000n }, partialMaker, partialTaker, parameters),
    /Fill replayed/,
  );
});

test("rejects duplicate normalized persisted ledger keys", () => {
  const upperMakerHash = `0x${maker.orderHash.slice(2).toUpperCase()}` as Hex32;
  const ledger = {
    ...createSettlementLedger(),
    filledBaseAtoms: { [maker.orderHash]: 0n, [upperMakerHash]: 0n },
  };
  assert.throws(() => settlePlannedFill(ledger, lifecycle(), fill, maker, taker, parameters), /duplicated after normalization/);
  assert.throws(
    () => createSettlementLedger({ [sellerId]: { baseAtoms: "bad" as unknown as bigint, quoteAtoms: 0n } }),
    /fit uint256/,
  );
});

test("conserves base and quote atoms across a randomised sweep of fills", () => {
  // Conservation is the one property this ledger cannot be allowed to lose:
  // no settlement may create or destroy an atom. The deltas are written as
  // five separate addDelta calls, and the two that carry the fees are the
  // easy ones to get wrong, so this exercises the arithmetic over a wide
  // spread of prices, sizes and fee splits rather than the single worked
  // example above.
  let seed = 987_654_321;
  const next = (bound: number) => {
    seed = (seed * 1_103_515_245 + 12_345) & 0x7fffffff;
    return seed % bound;
  };

  let settled = 0;
  let rejected = 0;
  for (let iteration = 0; iteration < 400; iteration += 1) {
    const priceTicks = BigInt(1 + next(20_000));
    const amount = BigInt(1 + next(500_000_000));
    const makerFeeBps = BigInt(next(31));
    const takerFeeBps = BigInt(next(31));
    const makerIsSeller = next(2) === 0;

    // The buyer's limit sits above the seller's, as it must for the two to
    // cross. With both limits equal there is often no integer quote amount
    // that satisfies a buyer rounding up and a seller rounding down at once,
    // and the module correctly refuses those; the test above covers that
    // case deliberately and this sweep is about the settled path.
    const spread = BigInt(1 + next(200));
    const sellerIntent = { ...intent(sellerId, 1, priceTicks, amount, 1n), maximumFeeBps: 30n };
    const buyerIntent = { ...intent(buyerId, 0, priceTicks + spread, amount, 1n), maximumFeeBps: 30n };
    const sellerSequenced: SequencedOrder = {
      orderHash: keccak256Text(`seller-${iteration}`), sequence: 1n, order: sellerIntent, remainingBaseAtoms: amount,
    };
    const buyerSequenced: SequencedOrder = {
      orderHash: keccak256Text(`buyer-${iteration}`), sequence: 2n, order: buyerIntent, remainingBaseAtoms: amount,
    };
    const sweepMaker = makerIsSeller ? sellerSequenced : buyerSequenced;
    const sweepTaker = makerIsSeller ? buyerSequenced : sellerSequenced;
    const sweepFill: PlannedFill = {
      makerOrderHash: sweepMaker.orderHash,
      takerOrderHash: sweepTaker.orderHash,
      makerSequence: sweepMaker.sequence,
      executionPriceTicks: priceTicks,
      baseAmountAtoms: amount,
    };

    // Fund both sides generously; the point here is the arithmetic, not the
    // insufficient-balance path, which the tests above already cover.
    const opening = {
      [sellerId]: { baseAtoms: amount, quoteAtoms: 0n },
      [buyerId]: { baseAtoms: 0n, quoteAtoms: UINT256_MAX / 4n },
      [treasuryId]: { baseAtoms: 0n, quoteAtoms: 0n },
    };
    const ledger = createSettlementLedger(opening);
    const claimed = claimOrderNonce(
      claimOrderNonce(emptyOrderLifecycle(), sweepMaker.orderHash, sweepMaker.order),
      sweepTaker.orderHash,
      sweepTaker.order,
    );

    let applied;
    try {
      applied = settlePlannedFill(ledger, claimed, sweepFill, sweepMaker, sweepTaker, {
        ...parameters, makerFeeBps, takerFeeBps,
      });
    } catch {
      // A fill with no integer quote amount inside both signed limits is
      // refused, which is the correct outcome and not a conservation
      // failure. Counted so the assertion below cannot pass on an empty set.
      rejected += 1;
      continue;
    }
    settled += 1;

    const before = [sellerId, buyerId, treasuryId].map((id) => balanceOf(ledger, id));
    const after = [sellerId, buyerId, treasuryId].map((id) => balanceOf(applied.ledger, id));
    const sum = (rows: ReadonlyArray<{ baseAtoms: bigint; quoteAtoms: bigint }>) => ({
      baseAtoms: rows.reduce((total, row) => total + row.baseAtoms, 0n),
      quoteAtoms: rows.reduce((total, row) => total + row.quoteAtoms, 0n),
    });
    assert.deepEqual(sum(after), sum(before), `iteration ${iteration} moved atoms into or out of existence`);

    // The fee recipient receives exactly the two fees, and the buyer's debit
    // is exactly the quote plus its own fee.
    assert.equal(balanceOf(applied.ledger, treasuryId).quoteAtoms, applied.buyerFeeAtoms + applied.sellerFeeAtoms);
    const buyerDebit = balanceOf(ledger, buyerId).quoteAtoms - balanceOf(applied.ledger, buyerId).quoteAtoms;
    assert.equal(buyerDebit, applied.quoteAmountAtoms + applied.buyerFeeAtoms);
  }

  assert.ok(settled > 300, `expected most fills to settle, only ${settled} did (${rejected} refused)`);
});
