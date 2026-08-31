import assert from "node:assert/strict";
import test from "node:test";

import { attestPayout, emptyPayoutLedger, screenPayout } from "./payout.ts";

const DEST = "t1Zo4ZzPXJiJ8M8pYMgL4tWbdkH7c8r7abc";

test("one burn authorizes at most one transparent payout", () => {
  const spent = emptyPayoutLedger();
  const first = attestPayout({ burnId: "burn-1", destination: DEST, amountZatoshis: 100n }, spent);
  assert.equal(first.status, "eligible");
  if (first.status === "eligible") {
    assert.equal(first.amountZatoshis, "100");
    assert.equal(first.destination, DEST);
  }
  const second = attestPayout({ burnId: "burn-1", destination: DEST, amountZatoshis: 100n }, spent);
  assert.equal(second.status, "rejected");
  assert.match(second.reason, /already authorized/);
});

test("shielded, TEX, and empty destinations cannot create a payout", () => {
  const spent = emptyPayoutLedger();
  assert.equal(attestPayout({ burnId: "b1", destination: "zs1notreal", amountZatoshis: 1n }, spent).status, "rejected");
  assert.equal(attestPayout({ burnId: "b2", destination: "tex1short", amountZatoshis: 1n }, spent).status, "rejected");
  assert.equal(attestPayout({ burnId: "b3", destination: "", amountZatoshis: 1n }, spent).status, "rejected");
  assert.equal(spent.size, 0);
});

test("pre-burn screen rejects shielded and TEX destinations without a burn", () => {
  const screened = screenPayout(DEST, 1n);
  assert.equal(screened.state, "screened");
  assert.equal(screenPayout("zs1notreal", 1n).state, "rejected");
  assert.equal(screenPayout("tex1short", 1n).state, "rejected");
  assert.equal(screenPayout(DEST, 0n).state, "rejected");
});

test("invalid burn id and non-positive amount cannot create a payout", () => {
  const spent = emptyPayoutLedger();
  assert.equal(attestPayout({ burnId: "", destination: DEST, amountZatoshis: 1n }, spent).status, "rejected");
  assert.equal(attestPayout({ burnId: "bad id!", destination: DEST, amountZatoshis: 1n }, spent).status, "rejected");
  assert.equal(attestPayout({ burnId: "ok", destination: DEST, amountZatoshis: 0n }, spent).status, "rejected");
  assert.equal(attestPayout({ burnId: "ok", destination: DEST, amountZatoshis: -1n }, spent).status, "rejected");
  assert.equal(spent.size, 0);
});
