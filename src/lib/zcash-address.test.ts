import assert from "node:assert/strict";
import test from "node:test";

import { inspectTransparentDestination } from "./zcash-address.ts";

test("rejects empty, payment-request, shielded, and TEX payouts", () => {
  assert.equal(inspectTransparentDestination("").class, "empty");
  assert.equal(inspectTransparentDestination("zcash:{TEX_ADDRESS}?amount=1").class, "placeholder");
  assert.equal(inspectTransparentDestination("zs1notreal").class, "shielded");
  assert.equal(inspectTransparentDestination("u1notreal").class, "shielded");
  assert.equal(inspectTransparentDestination("tex1short").class, "tex");
  assert.equal(inspectTransparentDestination("not-an-address").class, "unrecognized");
});

test("never marks a destination as currently eligible", () => {
  const shaped = inspectTransparentDestination("t1Zo4ZzPXJiJ8M8pYMgL4tWbdkH7c8r7abc");
  assert.equal(shaped.class, "transparent-shape");
  assert.equal(shaped.eligibleLater, false);
  assert.match(shaped.message, /does not send ZEC/);
});
