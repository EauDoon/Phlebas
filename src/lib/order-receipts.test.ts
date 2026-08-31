import assert from "node:assert/strict";
import test from "node:test";

import { keccak256Text } from "./keccak.ts";
import {
  appendIntakeReceipt,
  emptyReceiptChain,
  verifyReceiptChain,
} from "./order-receipts.ts";

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
