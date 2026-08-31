import assert from "node:assert/strict";
import test from "node:test";

import { chartSeries, markets } from "./market-data.ts";
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
  priceChartLabelCopy,
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

test("unavailable withheld copy names pZEC-USDT0 from real market state", () => {
  assert.equal(markets["ZEC/USDT"].settlementPair, "pZEC-USDT0");
  assert.equal(
    feedWithheldCopy("unavailable", markets["ZEC/USDT"].settlementPair),
    "Market data unavailable. Chart and 24h stats are withheld. Integrity checks failed. Settled as pZEC-USDT0.",
  );
  assert.doesNotMatch(
    feedWithheldCopy("unavailable", markets["ZEC/USDT"].settlementPair),
    /native ZEC/,
  );
  assert.doesNotMatch(
    feedWithheldCopy("unavailable", markets["ZEC/USDT"].settlementPair),
    /live feed/,
  );
});

test("unavailable withheld copy retargets settlement after a market switch", () => {
  const usdc = feedWithheldCopy("unavailable", markets["ZEC/USDC"].settlementPair);
  assert.equal(
    usdc,
    "Market data unavailable. Chart and 24h stats are withheld. Integrity checks failed. Settled as pZEC-USDC.",
  );
  assert.equal(markets["ZEC/USDC"].settlementPair, "pZEC-USDC");
  assert.equal(markets["ZEC/USDT"].settlementPair, "pZEC-USDT0");
  const usdt = feedWithheldCopy("unavailable", markets["ZEC/USDT"].settlementPair);
  assert.equal(
    usdt,
    "Market data unavailable. Chart and 24h stats are withheld. Integrity checks failed. Settled as pZEC-USDT0.",
  );
  assert.notEqual(usdc, usdt);
  assert.doesNotMatch(usdt, /native ZEC/);
  assert.doesNotMatch(usdt, /live feed/);
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

test("price chart label names the settlement pair from real market state", () => {
  const marketId = "ZEC/USDC" as const;
  const range = "4H" as const;
  assert.ok(chartSeries[marketId][range].length > 0);
  assert.equal(markets[marketId].settlementPair, "pZEC-USDC");
  assert.equal(
    priceChartLabelCopy(marketId, range),
    "Illustrative 4H price chart for ZEC/USDC, settled as pZEC-USDC",
  );
  assert.equal(
    priceChartLabelCopy("ZEC/USDT", "1D"),
    "Illustrative 1D price chart for ZEC/USDT, settled as pZEC-USDT0",
  );
  assert.equal(
    priceChartLabelCopy(marketId, "1H"),
    "Illustrative 1H price chart for ZEC/USDC, settled as pZEC-USDC",
  );
  assert.ok(chartSeries[marketId]["1H"].length > 0);
  assert.ok(chartSeries[marketId]["1D"].length > 0);
  assert.ok(chartSeries["ZEC/USDT"]["1H"].length > 0);
  assert.ok(chartSeries["ZEC/USDT"]["1D"].length > 0);
  assert.equal(
    priceChartLabelCopy("ZEC/USDT", "1H"),
    "Illustrative 1H price chart for ZEC/USDT, settled as pZEC-USDT0",
  );
  assert.equal(
    priceChartLabelCopy("ZEC/USDT", "1D"),
    "Illustrative 1D price chart for ZEC/USDT, settled as pZEC-USDT0",
  );
  assert.doesNotMatch(priceChartLabelCopy(marketId, range), /native ZEC/);
  assert.doesNotMatch(priceChartLabelCopy(marketId, range), /live/);
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
