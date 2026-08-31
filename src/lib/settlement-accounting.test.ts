import assert from "node:assert/strict";
import test from "node:test";

import type { TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import { claimOrderNonce, emptyOrderLifecycle } from "./order-lifecycle.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "./order-domain.ts";
import type { PlannedFill, SequencedOrder } from "./price-time.ts";
import { balanceOf, createSettlementLedger, settlePlannedFill } from "./settlement-accounting.ts";

const sellerId = accountIdentifier("session:seller");
const buyerId = accountIdentifier("session:buyer");
const treasuryId = accountIdentifier("session:treasury");
const pair = {
  baseChainId: chainIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d"),
  baseAssetId: assetIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133"),
  quoteChainId: chainIdentifier("eip155:42161"),
  quoteAssetId: assetIdentifier("eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831"),
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

test("records fill progress and rejects replayed state transitions", () => {
  const ledger = createSettlementLedger({
    [sellerId]: { baseAtoms: 100_000_000n, quoteAtoms: 0n },
    [buyerId]: { baseAtoms: 0n, quoteAtoms: 60_000_000n },
  });
  const applied = settlePlannedFill(ledger, lifecycle(), fill, maker, taker, parameters);
  assert.equal(applied.ledger.filledBaseAtoms[maker.orderHash], 100_000_000n);
  assert.throws(() => settlePlannedFill(applied.ledger, lifecycle(), fill, maker, taker, parameters), /does not reconcile/);
});
