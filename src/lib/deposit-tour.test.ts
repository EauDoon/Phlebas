import assert from "node:assert/strict";
import test from "node:test";

import {
  DEPOSIT_TOUR,
  depositTourById,
  depositTourIds,
  depositTourStep,
} from "./deposit-tour.ts";

test("deposit tour walks eligibility through complete without minting", () => {
  assert.equal(DEPOSIT_TOUR.length, 10);
  assert.equal(DEPOSIT_TOUR[0].title, "Eligibility");
  assert.equal(DEPOSIT_TOUR[1].title, "Address request");
  assert.match(DEPOSIT_TOUR[1].body, /No address generated in simulation/);
  assert.equal(DEPOSIT_TOUR[DEPOSIT_TOUR.length - 1].title, "Complete");
  assert.match(DEPOSIT_TOUR[DEPOSIT_TOUR.length - 1].body, /No native ZEC was received and nothing was minted/);
  assert.doesNotMatch(DEPOSIT_TOUR.map((step) => step.body).join(" "), /pZEC/);
  assert.equal(depositTourStep(-1).id, "eligibility");
  assert.equal(depositTourStep(99).id, "complete");
});

test("deposit tour list includes rejected, stale, and unavailable ids", () => {
  const ids = depositTourIds();
  assert.equal(ids.includes("rejected"), true);
  assert.equal(ids.includes("stale"), true);
  assert.equal(ids.includes("unavailable"), true);
  assert.ok(ids.indexOf("unavailable") > ids.indexOf("observed"));
  assert.ok(ids.indexOf("unavailable") < ids.indexOf("screening"));
  assert.ok(ids.indexOf("rejected") > ids.indexOf("screening"));
  assert.ok(ids.indexOf("rejected") < ids.indexOf("confirming"));
  assert.ok(ids.indexOf("stale") > ids.indexOf("confirming"));
  assert.ok(ids.indexOf("stale") < ids.indexOf("mint-queued"));
});

test("rejected stale and unavailable tour copy fails closed and does not mint", () => {
  const rejected = depositTourById("rejected");
  const stale = depositTourById("stale");
  const unavailable = depositTourById("unavailable");
  assert.ok(rejected);
  assert.ok(stale);
  assert.ok(unavailable);
  assert.equal(rejected.title, "Rejected");
  assert.equal(stale.title, "Stale");
  assert.equal(unavailable.title, "Unavailable");
  assert.match(rejected.body, /failed screening or is ineligible/);
  assert.match(rejected.body, /Nothing was minted/);
  assert.match(rejected.body, /Nothing is sent/);
  assert.match(stale.body, /Observation or proof is stale/);
  assert.match(stale.body, /Fail closed/);
  assert.match(stale.body, /Nothing is minted/);
  assert.match(unavailable.body, /Observers unavailable or disagree/);
  assert.match(unavailable.body, /Fail closed/);
  assert.match(unavailable.body, /Nothing is minted/);
  const closed = [rejected, stale, unavailable];
  for (const step of closed) {
    assert.doesNotMatch(step.body, /pZEC/);
    assert.doesNotMatch(step.body, /was minted credit/i);
    assert.doesNotMatch(step.body, /mint(s|ed|ing) (is|was) (complete|credited|queued)/i);
    assert.match(step.body, /Fail closed|Nothing was minted|Nothing is minted/);
  }
  const joined = DEPOSIT_TOUR.map((step) => `${step.title} ${step.body}`).join(" ");
  assert.doesNotMatch(joined, /pZEC/);
  assert.doesNotMatch(joined, /tex1/i);
  assert.equal(depositTourById("missing"), null);
  assert.equal(DEPOSIT_TOUR.length, depositTourIds().length);
});

test("deposit tour does not present a receivable address or shielded path", () => {
  const joined = DEPOSIT_TOUR.map((step) => `${step.title} ${step.body}`).join(" ");
  assert.doesNotMatch(joined, /tex1/i);
  assert.doesNotMatch(joined, /t1[A-Za-z0-9]/);
  assert.doesNotMatch(joined, /zs1/i);
  assert.doesNotMatch(joined, /Deposit ZEC/);
  assert.doesNotMatch(joined, /\blive\b/i);
});
