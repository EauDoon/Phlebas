import assert from "node:assert/strict";
import test from "node:test";

import { sepoliaDomain, type TypedOrder } from "./eip712.ts";
import { createMatcherOperator, intakeSignedOrder, sequenceRoot, type IntakeOrder, type MatcherOperator } from "./matcher-operator.ts";

const MAKER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const TAKER = "0x0000000000000000000000000000000000000004";
const ZERO = "0x0000000000000000000000000000000000000000";

function order(overrides: Partial<TypedOrder> = {}): TypedOrder {
  return {
    maker: MAKER,
    side: 0,
    baseAsset: "0x0000000000000000000000000000000000000001",
    quoteAsset: "0x0000000000000000000000000000000000000002",
    baseAmount: 100_000_000n,
    limitPriceTicks: 5291n,
    timeInForce: 0,
    nonce: 1n,
    accountEpoch: 0n,
    expiry: 0n,
    salt: 1n,
    recipient: MAKER,
    maximumFeeBps: 30,
    allowedVenues: 1,
    ...overrides,
  };
}

function intake(operator: MatcherOperator, value: IntakeOrder) {
  return intakeSignedOrder(operator, value, { verify: false });
}

test("operator sequences before matching and is deterministic", () => {
  const operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n);
  const emptyRoot = sequenceRoot(operator);
  assert.equal(emptyRoot.length, 64);
  assert.equal(emptyRoot, sequenceRoot(createMatcherOperator(sepoliaDomain(ZERO), 5291n)));
  const first = intake(operator, { ...order(), tif: "GTC", signature: "0x" });
  assert.equal(first.sequence, 1);
  assert.equal(first.digest, "23cf06d636047955c46b031bd1e5e788d74321da1c19d01ee562b2e194cdc4e9");
  assert.notEqual(sequenceRoot(operator), emptyRoot);
  const second = intake(operator, {
    ...order({ nonce: 2n, side: 1, limitPriceTicks: 5300n }),
    tif: "GTC",
    signature: "0x",
  });
  assert.equal(second.sequence, 2);
  assert.equal(operator.receipts.length, 2);
  assert.equal(second.digest === first.digest, false);
  assert.equal(first.signature, "0x");
});

test("operator rejects a typed order whose unix expiry has passed", () => {
  const operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n);
  assert.throws(
    () => intakeSignedOrder(operator, { ...order({ expiry: 1n }), tif: "GTC", signature: "0x" }),
    /expired-order/,
  );
  assert.equal(operator.book.bids.length, 0);
});

test("snapshot restore preserves book, sequence, and recovers stored signatures", async () => {
  const { snapshotOperator, restoreOperator } = await import("./matcher-operator.ts");
  const operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n);
  intake(operator, { ...order(), tif: "GTC", signature: "0x" });
  const restored = restoreOperator(snapshotOperator(operator), { verify: false });
  assert.equal(restored.sequence, 1);
  assert.equal(restored.book.bids.length, operator.book.bids.length);
  assert.equal(restored.book.lastTicks, operator.book.lastTicks);
  assert.equal(restored.receipts[0]?.digest, operator.receipts[0]?.digest);
  assert.equal(sequenceRoot(restored), sequenceRoot(operator));
});

test("frozen EIP-712 signature recovers the order maker", async () => {
  const { recoverAddress } = await import("./secp256k1.ts");
  const recovered = recoverAddress(
    "23cf06d636047955c46b031bd1e5e788d74321da1c19d01ee562b2e194cdc4e9",
    "0x25dda9696a4eed8b907e5b9fcb79f39169284f1c544f992627af993faa4a61e63c69c69b68a6306e970377cdcb9af0bb1dac6cd4f223f2fbba034c06682651091b",
  );
  assert.equal(recovered, MAKER.toLowerCase());
});

test("operator requires a valid signature unless a unit test explicitly disables it", () => {
  const operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n);
  assert.throws(() => intakeSignedOrder(operator, { ...order(), tif: "GTC", signature: "0x" }), /signature/i);
  const receipt = intakeSignedOrder(operator, {
    ...order(),
    tif: "GTC",
    signature: "0x25dda9696a4eed8b907e5b9fcb79f39169284f1c544f992627af993faa4a61e63c69c69b68a6306e970377cdcb9af0bb1dac6cd4f223f2fbba034c06682651091b",
  });
  assert.equal(receipt.sequence, 1);
});

test("rejects duplicates, expired orders, AMM-only orders, and unapproved pairs", () => {
  const operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n, {
    baseAsset: "0x0000000000000000000000000000000000000001",
    quoteAssets: ["0x0000000000000000000000000000000000000002"],
    now: () => 100n,
  });
  const accepted = { ...order(), tif: "GTC" as const, signature: "0x" };
  intake(operator, accepted);
  assert.throws(() => intake(operator, accepted), /duplicate-order/);
  assert.throws(() => intake(operator, { ...accepted, nonce: 2n, expiry: 99n }), /expired-order/);
  assert.throws(() => intake(operator, { ...accepted, nonce: 3n, allowedVenues: 2 }), /clob-venue/);
  assert.throws(() => intake(operator, {
    ...accepted,
    nonce: 4n,
    quoteAsset: "0x0000000000000000000000000000000000000003",
  }), /quote-asset/);
});

test("rejects invalid time-in-force and fee caps that cannot settle", () => {
  let operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n);
  assert.throws(
    () => intake(operator, { ...order(), tif: "DAY" as "GTC", signature: "0x" }),
    /time-in-force/,
  );
  assert.throws(
    () => intake(operator, { ...order({ maximumFeeBps: 4 }), tif: "GTC", signature: "0x" }),
    /maker-fee/,
  );

  operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n);
  intake(operator, { ...order({ side: 1 }), tif: "GTC", signature: "0x" });
  assert.throws(
    () => intake(operator, {
      ...order({ maker: TAKER, recipient: TAKER, nonce: 2n, maximumFeeBps: 14, timeInForce: 1 }),
      tif: "IOC",
      signature: "0x",
    }),
    /taker-fee/,
  );
});

test("prevents a wallet from crossing its own resting order", () => {
  const operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n);
  intake(operator, { ...order({ side: 1 }), tif: "GTC", signature: "0x" });
  assert.throws(
    () => intake(operator, {
      ...order({ nonce: 2n, timeInForce: 1 }),
      tif: "IOC",
      signature: "0x",
    }),
    /self-trade/,
  );
  assert.equal(operator.book.asks.length, 1);
});

test("binds the signed time-in-force to matcher behavior", () => {
  const operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n);
  assert.throws(
    () => intake(operator, { ...order(), tif: "IOC", signature: "0x" }),
    /signed-time-in-force/,
  );
});

test("rejects multi-maker IOC until atomic batch settlement exists", () => {
  const operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n);
  intake(operator, { ...order({ side: 1, baseAmount: 50_000_000n }), tif: "GTC", signature: "0x" });
  intake(operator, {
    ...order({ maker: TAKER, recipient: TAKER, side: 1, nonce: 2n, baseAmount: 50_000_000n }),
    tif: "GTC",
    signature: "0x",
  });
  assert.throws(
    () => intake(operator, {
      ...order({
        maker: "0x0000000000000000000000000000000000000005",
        recipient: "0x0000000000000000000000000000000000000005",
        nonce: 3n,
        timeInForce: 1,
      }),
      tif: "IOC",
      signature: "0x",
    }),
    /multi-fill/,
  );
});
