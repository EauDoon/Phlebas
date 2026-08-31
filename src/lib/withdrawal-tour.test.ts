import assert from "node:assert/strict";
import test from "node:test";

import { WITHDRAWAL_TOUR, withdrawalTourStep } from "./withdrawal-tour.ts";

test("withdrawal tour includes an unresolved demonstration without a payout", () => {
  assert.equal(WITHDRAWAL_TOUR[0].title, "Requested");
  assert.equal(WITHDRAWAL_TOUR.at(-1)?.title, "Confirmed");
  const unresolved = WITHDRAWAL_TOUR.find((step) => step.id === "unresolved");
  assert.ok(unresolved);
  assert.match(unresolved.body, /does not invent a payout/);
  assert.match(unresolved.body, /No native ZEC was sent/);
  assert.equal(withdrawalTourStep(-1).id, "requested");
  assert.equal(withdrawalTourStep(99).id, "confirmed");
});

test("withdrawal tour does not present a payable address or shielded path", () => {
  const joined = WITHDRAWAL_TOUR.map((step) => `${step.title} ${step.body}`).join(" ");
  assert.doesNotMatch(joined, /tex1/i);
  assert.doesNotMatch(joined, /t1[A-Za-z0-9]/);
  assert.doesNotMatch(joined, /zs1/i);
  assert.doesNotMatch(joined, /Withdraw ZEC/);
  assert.doesNotMatch(joined, /\blive\b/i);
  assert.doesNotMatch(joined, /shielded/i);
});
