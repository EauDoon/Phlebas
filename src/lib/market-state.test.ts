import assert from "node:assert/strict";
import test from "node:test";

import { markets } from "./market-data.ts";
import { emptyBook } from "./matcher.ts";
import {
  depthEmptyCopy,
  depthSessionLastCopy,
  emptyBookGateCopy,
  feedSurface,
  feedWithheldCopy,
  chartPanelEyebrowCopy,
  chartPanelHeadingCopy,
  chartRangeTabLabel,
  isFeedStatus,
  loadingGateCopy,
  orderBookCaptionCopy,
  sessionLastStatLabel,
  staleGateCopy,
  tapeCaptionCopy,
  tapeMiniLabel,
  ticketGate,
  unavailableGateCopy,
} from "./market-state.ts";

test("illustrative data with a book can move from preview to confirm", () => {
  const gate = ticketGate("illustrative", false);
  assert.equal(gate.canReview, true);
  assert.equal(gate.status, "illustrative");
});

test("an empty book disables preview-to-sign and names the settlement pair", () => {
  const market = markets["ZEC/USDC"];
  const book = emptyBook(market.lastTicks);
  const bookEmpty = book.bids.length === 0 && book.asks.length === 0;
  const gate = ticketGate("illustrative", bookEmpty, market.settlementPair);
  assert.equal(bookEmpty, true);
  assert.equal(gate.status, "empty");
  assert.equal(gate.canReview, false);
  assert.equal(gate.message, emptyBookGateCopy("pZEC-USDC"));
  assert.match(gate.message, /Settled as pZEC-USDC/);
  assert.match(depthEmptyCopy("pZEC-USDC"), /Settled as pZEC-USDC/);
  assert.equal(
    emptyBookGateCopy("pZEC-USDT0"),
    "No resting depth. Review is disabled until the local book has size. Settled as pZEC-USDT0.",
  );
  assert.equal(
    ticketGate("empty", false, "pZEC-USDT0").message,
    emptyBookGateCopy("pZEC-USDT0"),
  );
  assert.doesNotMatch(emptyBookGateCopy("pZEC-USDC"), /native ZEC/);
});

test("stale and unavailable feeds disable preview-to-sign", () => {
  assert.equal(ticketGate("stale", false).canReview, false);
  assert.equal(ticketGate("stale", false).asOf, "2026-08-30T16:32:08Z");
  assert.equal(ticketGate("unavailable", false).canReview, false);
  assert.equal(ticketGate("loading", false).canReview, false);
});

test("loading stale and unavailable ticket gates name the settlement pair", () => {
  const usdc = markets["ZEC/USDC"].settlementPair;
  const usdt = markets["ZEC/USDT"].settlementPair;
  const loading = ticketGate("loading", false, usdc);
  assert.equal(loading.canReview, false);
  assert.equal(loading.message, loadingGateCopy(usdc));
  assert.match(loading.message, /Settled as pZEC-USDC/);
  const stale = ticketGate("stale", false, usdt);
  assert.equal(stale.canReview, false);
  assert.equal(stale.asOf, "2026-08-30T16:32:08Z");
  assert.equal(stale.message, staleGateCopy(usdt));
  assert.match(stale.message, /Settled as pZEC-USDT0/);
  const unavailable = ticketGate("unavailable", false, usdc);
  assert.equal(unavailable.canReview, false);
  assert.equal(unavailable.message, unavailableGateCopy(usdc));
  assert.doesNotMatch(unavailableGateCopy(usdc), /native ZEC/);
  assert.doesNotMatch(staleGateCopy(usdt), /live feed/);
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
  assert.equal(depthSessionLastCopy("pZEC-USDC", null), "session last · pZEC-USDC");
  assert.equal(
    depthSessionLastCopy("pZEC-USDT0", "0.13"),
    "session last · pZEC-USDT0 · spread 0.13",
  );
  assert.equal(
    tapeCaptionCopy("ZEC/USDC", true),
    "Recent ZEC/USDC trades withheld. Settled as pZEC-USDC. Fixture tape is not shown.",
  );
  assert.match(tapeCaptionCopy("ZEC/USDT", false), /settled as pZEC-USDT0/);
  assert.equal(sessionLastStatLabel("pZEC-USDC", true), "Session last · pZEC-USDC");
  assert.equal(sessionLastStatLabel("pZEC-USDT0", false), "Session last");
  assert.equal(tapeMiniLabel(false, true, "pZEC-USDC"), "Fixture tape");
  assert.equal(tapeMiniLabel(false, false, "pZEC-USDT0"), "Withheld · pZEC-USDT0");
  assert.equal(tapeMiniLabel(true, false, "pZEC-USDC"), "Session + fixture");
  assert.equal(chartRangeTabLabel("4H", markets["ZEC/USDC"].settlementPair), "4H · pZEC-USDC");
  assert.equal(chartRangeTabLabel("1D", markets["ZEC/USDT"].settlementPair), "1D · pZEC-USDT0");
  assert.doesNotMatch(chartRangeTabLabel("1H", "pZEC-USDC"), /native ZEC/);
  assert.equal(chartPanelHeadingCopy("ZEC/USDC"), "ZEC/USDC · pZEC-USDC");
  assert.equal(chartPanelHeadingCopy("ZEC/USDT"), "ZEC/USDT · pZEC-USDT0");
  assert.equal(chartPanelEyebrowCopy(markets["ZEC/USDC"].settlementPair), "Illustrative market data · pZEC-USDC");
  assert.doesNotMatch(chartPanelHeadingCopy("ZEC/USDC"), /native ZEC/);
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
