import assert from "node:assert/strict";
import test from "node:test";

import {
  LANDING_JOURNEYS,
  isLandingJourneyId,
  nextLandingJourneyId,
} from "./landing-journeys.ts";

test("landing journeys are four manually selectable paths", () => {
  assert.deepEqual(LANDING_JOURNEYS.map((journey) => journey.tab), [
    "Trader",
    "LP",
    "Deposit",
    "Withdrawal",
  ]);
  assert.equal(isLandingJourneyId("lp"), true);
  assert.equal(isLandingJourneyId("earn"), false);
  assert.equal(nextLandingJourneyId("trader", 1), "lp");
  assert.equal(nextLandingJourneyId("withdrawal", 1), "trader");
  assert.equal(nextLandingJourneyId("trader", -1), "withdrawal");
});

test("landing journey copy stays a preview, not a live or native-ZEC action", () => {
  for (const journey of LANDING_JOURNEYS) {
    assert.doesNotMatch(journey.action, /^Deposit ZEC$/i);
    assert.doesNotMatch(journey.action, /^Withdraw ZEC$/i);
    assert.doesNotMatch(journey.description, /\blive\b/i);
    assert.doesNotMatch(journey.description, /shielded/i);
    assert.doesNotMatch(journey.description, /native-ZEC/i);
    assert.doesNotMatch(journey.description, /is trustless/);
  }
  assert.match(LANDING_JOURNEYS[2].description, /transparent native ZEC/);
  assert.match(LANDING_JOURNEYS[3].description, /pZEC burn/);
});
