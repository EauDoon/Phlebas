import assert from "node:assert/strict";
import test from "node:test";

import {
  WITHDRAWAL_TOUR,
  withdrawalTourById,
  withdrawalTourIds,
  withdrawalTourStep,
} from "./withdrawal-tour.ts";

test("withdrawal tour list includes rejected and unresolved ids", () => {
  const ids = withdrawalTourIds();
  assert.equal(ids.includes("rejected"), true);
  assert.equal(ids.includes("unresolved"), true);
  assert.ok(ids.indexOf("rejected") > ids.indexOf("screened"));
  assert.ok(ids.indexOf("rejected") < ids.indexOf("burn submitted"));
  assert.ok(ids.indexOf("unresolved") > ids.indexOf("mined"));
  assert.ok(ids.indexOf("unresolved") < ids.indexOf("confirmed"));
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

test("withdrawal tour step helper stays in range", () => {
  assert.equal(withdrawalTourStep(-1).id, "requested");
  assert.equal(withdrawalTourStep(99).id, "confirmed");
  assert.equal(withdrawalTourById("missing"), null);
  assert.equal(WITHDRAWAL_TOUR.length, withdrawalTourIds().length);
});
