import assert from "node:assert/strict";
import test from "node:test";

import {
  LANDING_JOURNEYS,
  isLandingJourneyId,
  landingJourneyFromHash,
  landingJourneyHash,
  nextLandingJourneyId,
} from "./landing-journeys.ts";

test("four landing journeys are Trader, LP, Deposit, and Withdrawal", () => {
  assert.deepEqual(LANDING_JOURNEYS.map((journey) => journey.tab), [
    "Trader",
    "LP",
    "Deposit",
    "Withdrawal",
  ]);
  assert.equal(LANDING_JOURNEYS[0]?.action, "Preview trading");
  assert.equal(LANDING_JOURNEYS[1]?.href, "/liquidity");
  assert.equal(LANDING_JOURNEYS[2]?.href, "/trade?view=bridge");
  assert.equal(LANDING_JOURNEYS[3]?.href, "/trade?view=bridge&journey=withdrawal");
  assert.doesNotMatch(LANDING_JOURNEYS.map((journey) => journey.description).join(" "), /pZEC/);
  assert.match(LANDING_JOURNEYS[0].description, /Preview ZEC spot order entry/);
});

test("landing journeys are four manually selectable paths", () => {
  assert.equal(isLandingJourneyId("lp"), true);
  assert.equal(isLandingJourneyId("earn"), false);
  assert.equal(nextLandingJourneyId("trader", 1), "lp");
  assert.equal(nextLandingJourneyId("withdrawal", 1), "trader");
  assert.equal(nextLandingJourneyId("trader", -1), "withdrawal");
});

test("hash selects LP after the journeys heading, otherwise trader", () => {
  assert.equal(landingJourneyFromHash("#journey-lp"), "lp");
  assert.equal(landingJourneyFromHash("journey-withdrawal"), "withdrawal");
  assert.equal(landingJourneyFromHash("#journeys"), "trader");
  assert.equal(landingJourneyFromHash(""), "trader");
  assert.equal(landingJourneyHash("deposit"), "#journey-deposit");
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
  assert.match(LANDING_JOURNEYS[2].description, /historical transparent-ZEC gateway tour/);
  assert.match(LANDING_JOURNEYS[3].description, /historical burn-and-payout fixture/);
  assert.match(LANDING_JOURNEYS[1].description, /wallet-held solvers/);
});
