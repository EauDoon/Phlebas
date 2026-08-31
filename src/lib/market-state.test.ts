import assert from "node:assert/strict";
import test from "node:test";

import {
  depthEmptyCopy,
  feedSurface,
  feedWithheldCopy,
  isFeedStatus,
  orderBookCaptionCopy,
  ticketGate,
} from "./market-state.ts";

test("illustrative data with a book can move from preview to confirm", () => {
  const gate = ticketGate("illustrative", false);
  assert.equal(gate.canReview, true);
  assert.equal(gate.status, "illustrative");
});

test("an empty book disables preview-to-sign", () => {
  const gate = ticketGate("illustrative", true);
  assert.equal(gate.status, "empty");
  assert.equal(gate.canReview, false);
});

test("stale and unavailable feeds disable preview-to-sign", () => {
  assert.equal(ticketGate("stale", false).canReview, false);
  assert.equal(ticketGate("stale", false).asOf, "2026-08-30T16:32:08Z");
  assert.equal(ticketGate("unavailable", false).canReview, false);
  assert.equal(ticketGate("loading", false).canReview, false);
});

test("chart and stats withhold fixtures for empty, loading, and unavailable feeds", () => {
  assert.equal(feedSurface("illustrative").showFixtures, true);
  assert.equal(feedSurface("stale").showFixtures, true);
  assert.match(feedSurface("stale").message, /As of 2026-08-30T16:32:08Z/);
  assert.equal(feedSurface("empty").showFixtures, false);
  assert.equal(feedSurface("loading").showFixtures, false);
  assert.equal(feedSurface("unavailable").showFixtures, false);
  assert.match(feedSurface("unavailable").message, /withheld/);
});

test("depth and tape empty copy names the settlement pair", () => {
  assert.equal(
    depthEmptyCopy("pZEC-USDC"),
    "No resting depth. The local book is empty. Settled as pZEC-USDC.",
  );
  assert.equal(
    depthEmptyCopy("pZEC-USDT0"),
    "No resting depth. The local book is empty. Settled as pZEC-USDT0.",
  );
  assert.match(feedWithheldCopy("unavailable", "pZEC-USDC"), /pZEC-USDC/);
  assert.match(feedWithheldCopy("unavailable", "pZEC-USDT0"), /pZEC-USDT0/);
  assert.match(feedWithheldCopy("empty", "pZEC-USDC"), /No 24h stats or chart series/);
  assert.match(orderBookCaptionCopy("ZEC/USDC"), /settled as pZEC-USDC/);
  assert.match(orderBookCaptionCopy("ZEC/USDT"), /settled as pZEC-USDT0/);
  assert.doesNotMatch(depthEmptyCopy("pZEC-USDC"), /native ZEC/);
  assert.doesNotMatch(feedWithheldCopy("loading", "pZEC-USDC"), /live feed/);
});

test("allowlists only documented feed states", () => {
  assert.equal(isFeedStatus("illustrative"), true);
  assert.equal(isFeedStatus("loading"), true);
  assert.equal(isFeedStatus("empty"), true);
  assert.equal(isFeedStatus("stale"), true);
  assert.equal(isFeedStatus("unavailable"), true);
  assert.equal(isFeedStatus("live"), false);
  assert.equal(isFeedStatus(undefined), false);
});
