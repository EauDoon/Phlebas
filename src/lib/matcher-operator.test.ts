import assert from "node:assert/strict";
import test from "node:test";

import { sepoliaDomain, type TypedOrder } from "./eip712.ts";
import { createMatcherOperator, intakeSignedOrder, sequenceRoot } from "./matcher-operator.ts";

const MAKER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const ZERO = "0x0000000000000000000000000000000000000000";

function order(overrides: Partial<TypedOrder> = {}): TypedOrder {
  return {
    maker: MAKER,
    side: 0,
    baseAsset: "0x0000000000000000000000000000000000000001",
    quoteAsset: "0x0000000000000000000000000000000000000002",
    baseAmount: 100_000_000n,
    limitPriceTicks: 5291n,
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

test("operator sequences before matching and is deterministic", () => {
  const operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n);
  const emptyRoot = sequenceRoot(operator);
  assert.equal(emptyRoot.length, 64);
  assert.equal(emptyRoot, sequenceRoot(createMatcherOperator(sepoliaDomain(ZERO), 5291n)));
  const first = intakeSignedOrder(operator, { ...order(), tif: "GTC", signature: "0x" });
  assert.equal(first.sequence, 1);
  assert.equal(first.digest, "eed61ef0af305769d9791ea9cb3a6cf587afa1e8acc3c81108e692e4900c8c1a");
  assert.notEqual(sequenceRoot(operator), emptyRoot);
  const second = intakeSignedOrder(operator, {
    ...order({ nonce: 2n, side: 1, limitPriceTicks: 5300n }),
    tif: "GTC",
    signature: "0x",
  });
  assert.equal(second.sequence, 2);
  assert.equal(operator.receipts.length, 2);
  assert.equal(second.digest === first.digest, false);
  assert.equal(first.signature, "0x");
});

test("snapshot restore preserves book, sequence, and recovers stored signatures", async () => {
  const { snapshotOperator, restoreOperator } = await import("./matcher-operator.ts");
  const operator = createMatcherOperator(sepoliaDomain(ZERO), 5291n);
  intakeSignedOrder(operator, { ...order(), tif: "GTC", signature: "0x" });
  const restored = restoreOperator(snapshotOperator(operator));
  assert.equal(restored.sequence, 1);
  assert.equal(restored.book.bids.length, operator.book.bids.length);
  assert.equal(restored.book.lastTicks, operator.book.lastTicks);
  assert.equal(restored.receipts[0]?.digest, operator.receipts[0]?.digest);
  assert.equal(sequenceRoot(restored), sequenceRoot(operator));
});

test("frozen EIP-712 signature recovers the order maker", async () => {
  const { recoverAddress } = await import("./secp256k1.ts");
  const recovered = recoverAddress(
    "eed61ef0af305769d9791ea9cb3a6cf587afa1e8acc3c81108e692e4900c8c1a",
    "0x0fd73c37f4362021fdd1693bdca85f8592eb338a7d62338504ba2cbaee2bb90f26bdec5b2efeb086308bce8a9db936bb754bfafeda2305485b91a3b1c371ee8b1b",
  );
  assert.equal(recovered, MAKER.toLowerCase());
});
