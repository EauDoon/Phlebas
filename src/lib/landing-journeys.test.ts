import assert from "node:assert/strict";
import test from "node:test";

import {
  LANDING_JOURNEYS,
  LANDING_JOURNEY_IDS,
  isLandingJourneyId,
  landingJourneyFromHash,
  landingJourneyHash,
  nextLandingJourneyId,
} from "./landing-journeys.ts";

function corpus(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(corpus).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.values(value).map(corpus).join("\n");
  }
  return "";
}

const shipped = corpus(LANDING_JOURNEYS);

test("landing journeys are Trade, Provide quotes, and Read settlement", () => {
  assert.deepEqual(LANDING_JOURNEY_IDS, ["trader", "quotes", "settlement"]);
  assert.deepEqual(
    LANDING_JOURNEYS.map((journey) => journey.tab),
    ["Trade", "Provide quotes", "Read settlement"],
  );
  assert.equal(LANDING_JOURNEYS[0]?.href, "/trade?view=trade");
  assert.equal(LANDING_JOURNEYS[0]?.action, "Open terminal");
  assert.equal(LANDING_JOURNEYS[1]?.href, "/liquidity");
  assert.equal(LANDING_JOURNEYS[1]?.tab, "Provide quotes");
  assert.equal(LANDING_JOURNEYS[2]?.href, "/trade?view=settlement");
  assert.equal(LANDING_JOURNEYS[2]?.tab, "Read settlement");
  assert.equal(LANDING_JOURNEYS.length, 3);
});

test("deposit and withdrawal are not featured landing journeys", () => {
  assert.equal(isLandingJourneyId("deposit"), false);
  assert.equal(isLandingJourneyId("withdrawal"), false);
  assert.equal(isLandingJourneyId("lp"), false);
  assert.equal(isLandingJourneyId("quotes"), true);
  for (const journey of LANDING_JOURNEYS) {
    assert.doesNotMatch(journey.tab, /deposit|withdraw/i);
    assert.doesNotMatch(journey.action, /deposit|withdraw/i);
  }
});

test("landing journeys are three manually selectable paths", () => {
  assert.equal(isLandingJourneyId("quotes"), true);
  assert.equal(isLandingJourneyId("earn"), false);
  assert.equal(nextLandingJourneyId("trader", 1), "quotes");
  assert.equal(nextLandingJourneyId("settlement", 1), "trader");
  assert.equal(nextLandingJourneyId("trader", -1), "settlement");
});

test("hash selects a shipped journey id, otherwise trader", () => {
  assert.equal(landingJourneyFromHash("#journey-quotes"), "quotes");
  assert.equal(landingJourneyFromHash("journey-settlement"), "settlement");
  assert.equal(landingJourneyFromHash("#paths"), "trader");
  assert.equal(landingJourneyFromHash("#journey-deposit"), "trader");
  assert.equal(landingJourneyFromHash(""), "trader");
  assert.equal(landingJourneyHash("quotes"), "#journey-quotes");
});

test("landing journey copy fails closed on live product claims", () => {
  assert.doesNotMatch(shipped, /pZEC/);
  assert.doesNotMatch(shipped, /USDT0/);
  assert.doesNotMatch(shipped, /\blive funds\b/i);
  assert.doesNotMatch(shipped, /\bis a live exchange\b/i);
  assert.doesNotMatch(shipped, /\btrustless\b/i);
  assert.doesNotMatch(shipped, /\bis audited\b/i);
  assert.doesNotMatch(shipped, /\bpayable\b/i);
  assert.doesNotMatch(shipped, /\bshielded market\b/i);
  for (const journey of LANDING_JOURNEYS) {
    assert.doesNotMatch(journey.action, /^Deposit ZEC$/i);
    assert.doesNotMatch(journey.action, /^Withdraw ZEC$/i);
    assert.doesNotMatch(journey.description, /\bsimulations?\b/i);
    assert.doesNotMatch(journey.description, /\bfixture\b/i);
    assert.doesNotMatch(journey.description, /\binspect\b/i);
    assert.doesNotMatch(journey.description, /\bwalkthrough\b/i);
  }
  assert.match(LANDING_JOURNEYS[1].description, /wallet-held|own wallets/);
});
