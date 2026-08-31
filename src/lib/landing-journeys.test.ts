import assert from "node:assert/strict";
import test from "node:test";

import {
  LANDING_JOURNEYS,
  landingJourneyFromHash,
  landingJourneyHash,
} from "./landing-journeys.ts";

test("four landing journeys are Trader, LP, Deposit, and Withdrawal", () => {
  assert.deepEqual(LANDING_JOURNEYS.map((journey) => journey.tab), ["Trader", "LP", "Deposit", "Withdrawal"]);
  assert.equal(LANDING_JOURNEYS[0]?.action, "Preview trading");
  assert.equal(LANDING_JOURNEYS[1]?.href, "/liquidity");
  assert.equal(LANDING_JOURNEYS[2]?.href, "/trade?view=bridge");
  assert.equal(LANDING_JOURNEYS[3]?.href, "/trade?view=bridge&journey=withdrawal");
});

test("hash selects LP after the journeys heading, otherwise trader", () => {
  assert.equal(landingJourneyFromHash("#journey-lp"), "lp");
  assert.equal(landingJourneyFromHash("journey-withdrawal"), "withdrawal");
  assert.equal(landingJourneyFromHash("#journeys"), "trader");
  assert.equal(landingJourneyFromHash(""), "trader");
  assert.equal(landingJourneyHash("deposit"), "#journey-deposit");
});
