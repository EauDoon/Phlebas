import assert from "node:assert/strict";
import test from "node:test";

import {
  FEED_STATUS_LABELS,
  FEED_STATUSES,
  feedSurface,
  feedSurfaceCopy,
  isFeedStatus,
  nextFeedStatus,
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

test("chart and 24h stats reuse ticket-gate names", () => {
  assert.equal(feedSurfaceCopy("illustrative").eyebrow, "Illustrative market data");
  assert.match(feedSurfaceCopy("illustrative").statsNote, /Not a live/);
  assert.equal(feedSurfaceCopy("stale").eyebrow, "Market data stale");
  assert.match(feedSurfaceCopy("stale").statsNote, /2026-08-30T16:32:08Z/);
  assert.equal(feedSurfaceCopy("unavailable").eyebrow, "Market data unavailable");
  assert.equal(feedSurfaceCopy("empty").eyebrow, "Order book empty");
  assert.equal(feedSurfaceCopy("loading").eyebrow, "Loading market data");
  assert.doesNotMatch(feedSurfaceCopy("stale").statsNote, /\blive feed\b/i);
});

test("empty loading and unavailable feeds withhold fixture series", () => {
  assert.equal(feedSurface("illustrative").showFixtures, true);
  assert.equal(feedSurface("stale").showFixtures, true);
  assert.equal(feedSurface("empty").showFixtures, false);
  assert.equal(feedSurface("loading").showFixtures, false);
  assert.equal(feedSurface("unavailable").showFixtures, false);
  assert.match(feedSurface("empty").statsNote, /withheld/);
  assert.match(feedSurface("unavailable").message, /Integrity checks failed/);
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

test("feed statuses wrap under arrow deltas", () => {
  assert.deepEqual([...FEED_STATUSES], ["illustrative", "loading", "empty", "stale", "unavailable"]);
  assert.equal(FEED_STATUS_LABELS.illustrative, "Illustrative");
  assert.equal(nextFeedStatus("illustrative", 1), "loading");
  assert.equal(nextFeedStatus("unavailable", 1), "illustrative");
  assert.equal(nextFeedStatus("illustrative", -1), "unavailable");
  assert.equal(nextFeedStatus("stale", 2), "illustrative");
});
