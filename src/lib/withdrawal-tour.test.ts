import assert from "node:assert/strict";
import test from "node:test";

import {
  WITHDRAWAL_TOUR,
  withdrawalTourById,
  withdrawalTourIds,
  withdrawalTourStep,
} from "./withdrawal-tour.ts";

test("withdrawal tour list includes rejected, expired, refunded, and unresolved ids", () => {
  const ids = withdrawalTourIds();
  assert.equal(ids.includes("rejected"), true);
  assert.equal(ids.includes("expired"), true);
  assert.equal(ids.includes("refunded"), true);
  assert.equal(ids.includes("unresolved"), true);
  assert.equal(ids.includes("unresolved-observed"), true);
  assert.equal(ids.includes("input-restored"), true);
  assert.ok(ids.indexOf("rejected") > ids.indexOf("screened"));
  assert.ok(ids.indexOf("rejected") < ids.indexOf("burn submitted"));
  assert.ok(ids.indexOf("expired") > ids.indexOf("burn submitted"));
  assert.ok(ids.indexOf("expired") < ids.indexOf("burn finalized"));
  assert.ok(ids.indexOf("refunded") > ids.indexOf("payable"));
  assert.ok(ids.indexOf("refunded") < ids.indexOf("signed"));
  assert.ok(ids.indexOf("refunded") < ids.indexOf("transaction_prepared"));
  assert.ok(ids.indexOf("unresolved") > ids.indexOf("mined"));
  assert.ok(ids.indexOf("unresolved-observed") > ids.indexOf("unresolved"));
  assert.ok(ids.indexOf("input-restored") > ids.indexOf("unresolved-observed"));
  assert.ok(ids.indexOf("input-restored") < ids.indexOf("confirmed"));
});

test("rejected and unresolved tour copy stays a simulation that sends nothing", () => {
  const rejected = withdrawalTourById("rejected");
  const unresolved = withdrawalTourById("unresolved");
  assert.ok(rejected);
  assert.ok(unresolved);
  assert.equal(rejected.title, "Rejected");
  assert.match(rejected.body, /Nothing was burned/);
  assert.match(rejected.body, /Nothing is sent/);
  assert.equal(unresolved.title, "Unresolved");
  assert.match(unresolved.body, /stale/);
  assert.match(unresolved.body, /Incident halt/);
  assert.match(unresolved.body, /Nothing is sent/);
  const joined = WITHDRAWAL_TOUR.map((step) => `${step.title} ${step.body}`).join(" ");
  assert.doesNotMatch(joined, /tex1/i);
  assert.doesNotMatch(joined, /\blive payout/i);
  assert.doesNotMatch(joined, /pZEC/);
});

test("refunded tour copy restores tZEC before signature and sends nothing", () => {
  const refunded = withdrawalTourById("refunded");
  assert.ok(refunded);
  assert.equal(refunded.title, "Refunded");
  assert.match(refunded.body, /Unrecoverable pre-signature failure/);
  assert.match(refunded.body, /single-use refund restores tZEC/i);
  assert.match(refunded.body, /permanently cancels the unpaid claim/);
  assert.match(refunded.body, /Nothing is sent/);
  assert.match(refunded.body, /not live settlement/);
  assert.doesNotMatch(refunded.body, /tex1/i);
  assert.doesNotMatch(refunded.body, /\blive payout/i);
  assert.doesNotMatch(refunded.body, /pZEC/);
});

test("unresolved recovery tour copy observes the committed tx or restores inputs", () => {
  const observed = withdrawalTourById("unresolved-observed");
  const restored = withdrawalTourById("input-restored");
  assert.ok(observed);
  assert.ok(restored);
  assert.equal(observed.title, "Observed recovery");
  assert.match(observed.body, /exact committed transaction was observed/i);
  assert.match(observed.body, /returns to broadcast/);
  assert.match(observed.body, /Nothing is sent/);
  assert.match(observed.body, /not live settlement/);
  assert.equal(restored.title, "Inputs restored");
  assert.match(restored.body, /Verified input restoration/);
  assert.match(restored.body, /returns the claim to payable/);
  assert.match(restored.body, /Nothing is sent/);
  assert.doesNotMatch(observed.body, /pZEC/);
  assert.doesNotMatch(restored.body, /pZEC/);
  assert.doesNotMatch(observed.body, /tex1/i);
  assert.doesNotMatch(restored.body, /tex1/i);
});

test("expired evidence tour copy closes without a finalized burn and sends nothing", () => {
  const expired = withdrawalTourById("expired");
  assert.ok(expired);
  assert.equal(expired.title, "Expired evidence");
  assert.match(expired.body, /expired or was reorganized/);
  assert.match(expired.body, /Closed without a finalized burn/);
  assert.match(expired.body, /Nothing is sent/);
  assert.match(expired.body, /not live settlement/);
  assert.doesNotMatch(expired.body, /tex1/i);
  assert.doesNotMatch(expired.body, /\blive payout/i);
  assert.doesNotMatch(expired.body, /pZEC/);
});

test("withdrawal tour step helper stays in range", () => {
  assert.equal(withdrawalTourStep(-1).id, "requested");
  assert.equal(withdrawalTourStep(99).id, "confirmed");
  assert.equal(withdrawalTourById("missing"), null);
  assert.equal(WITHDRAWAL_TOUR.length, withdrawalTourIds().length);
});

test("withdrawal tour includes an unresolved demonstration without a payout", () => {
  assert.equal(WITHDRAWAL_TOUR[0].title, "Requested");
  assert.equal(WITHDRAWAL_TOUR.at(-1)?.title, "Confirmed");
  const unresolved = WITHDRAWAL_TOUR.find((step) => step.id === "unresolved");
  assert.ok(unresolved);
  assert.match(unresolved.body, /stale/);
  assert.match(unresolved.body, /Nothing is sent/);
  assert.equal(withdrawalTourStep(-1).id, "requested");
  assert.equal(withdrawalTourStep(99).id, "confirmed");
});

test("withdrawal tour does not present a payable address or shielded path", () => {
  const joined = WITHDRAWAL_TOUR.map((step) => `${step.title} ${step.body}`).join(" ");
  assert.doesNotMatch(joined, /tex1/i);
  assert.doesNotMatch(joined, /t1[A-Za-z0-9]/);
  assert.doesNotMatch(joined, /zs1/i);
  assert.doesNotMatch(joined, /Withdraw ZEC/);
  assert.doesNotMatch(joined, /shielded/i);
});
