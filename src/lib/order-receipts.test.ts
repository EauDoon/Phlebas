import assert from "node:assert/strict";
import test from "node:test";

import { keccak256Text } from "./keccak.ts";
import {
  appendIntakeReceipt,
  emptyReceiptChain,
  hashIntakeReceipt,
  verifyReceiptChain,
} from "./order-receipts.ts";
import type { Hex32 } from "./order-domain.ts";

test("assigns monotonic receipt sequences and chains every accepted order", () => {
  const first = appendIntakeReceipt(emptyReceiptChain(), keccak256Text("order-1"), 100n);
  const second = appendIntakeReceipt(first.chain, keccak256Text("order-2"), 101n);
  assert.equal(first.receipt.sequence, 1n);
  assert.equal(second.receipt.sequence, 2n);
  assert.equal(second.receipt.previousReceiptHash, first.receipt.receiptHash);
  assert.equal(verifyReceiptChain(second.chain), true);
});

test("rejects a second intake receipt for the same order hash", () => {
  const hash = keccak256Text("order-1");
  const first = appendIntakeReceipt(emptyReceiptChain(), hash, 100n);
  assert.throws(() => appendIntakeReceipt(first.chain, hash, 101n), /already has/);
});

test("detects omission, reordering, hash alteration, and invalid heads", () => {
  const first = appendIntakeReceipt(emptyReceiptChain(), keccak256Text("order-1"), 100n);
  const second = appendIntakeReceipt(first.chain, keccak256Text("order-2"), 101n);
  assert.equal(verifyReceiptChain({ ...second.chain, receipts: [second.receipt, first.receipt] }), false);
  assert.equal(verifyReceiptChain({ ...second.chain, receipts: [second.receipt] }), false);
  assert.equal(verifyReceiptChain({ ...second.chain, head: first.receipt.receiptHash }), false);
  assert.equal(verifyReceiptChain({
    ...second.chain,
    receipts: [first.receipt, { ...second.receipt, acceptedAtSeconds: 999n }],
  }), false);
});

test("keeps receipts signable but unsigned in the no-key reference", () => {
  const { receipt } = appendIntakeReceipt(emptyReceiptChain(), keccak256Text("order-1"), 100n);
  assert.deepEqual(Object.keys(receipt).sort(), [
    "acceptedAtSeconds",
    "orderHash",
    "previousReceiptHash",
    "receiptHash",
    "sequence",
    "version",
  ]);
});

test("rejects semantic hash duplicates and time regression", () => {
  const first = appendIntakeReceipt(emptyReceiptChain(), keccak256Text("order-1"), 100n);
  const upperOrderHash = `0x${first.receipt.orderHash.slice(2).toUpperCase()}` as Hex32;
  const duplicateReceipt = {
    version: 1 as const,
    sequence: 2n,
    acceptedAtSeconds: 101n,
    orderHash: upperOrderHash,
    previousReceiptHash: first.receipt.receiptHash,
    receiptHash: hashIntakeReceipt(2n, 101n, upperOrderHash, first.receipt.receiptHash),
  };
  assert.equal(verifyReceiptChain({ receipts: [first.receipt, duplicateReceipt], head: duplicateReceipt.receiptHash, nextSequence: 3n }), false);
  assert.throws(() => appendIntakeReceipt(first.chain, keccak256Text("order-2"), 99n), /cannot move backward/);
});

test("malformed persisted receipt fields fail closed", () => {
  const first = appendIntakeReceipt(emptyReceiptChain(), keccak256Text("order-1"), 100n);
  assert.equal(verifyReceiptChain({
    ...first.chain,
    receipts: [{ ...first.receipt, orderHash: "0x12" as Hex32 }],
  }), false);
  assert.equal(verifyReceiptChain({
    ...first.chain,
    receipts: [{ ...first.receipt, acceptedAtSeconds: "bad" as unknown as bigint }],
  }), false);
});

test("rejects runtime type confusion and invalid prior receipt state", () => {
  const orderHash = keccak256Text("order-1");
  assert.throws(
    () => hashIntakeReceipt(1n, "bad" as unknown as bigint, orderHash, emptyReceiptChain().head),
    /must be a bigint/,
  );
  const first = appendIntakeReceipt(emptyReceiptChain(), orderHash, 100n);
  assert.throws(
    () => appendIntakeReceipt({ ...first.chain, nextSequence: 3n }, keccak256Text("order-2"), 101n),
    /invalid receipt chain/,
  );
  assert.throws(
    () => appendIntakeReceipt({ ...first.chain, head: keccak256Text("wrong-head") }, keccak256Text("order-2"), 101n),
    /invalid receipt chain/,
  );
});
