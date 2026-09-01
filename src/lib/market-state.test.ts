import assert from "node:assert/strict";
import test from "node:test";

import {
  FEED_STATUS_LABELS,
  FEED_STATUSES,
  bookSideControlCopy,
  chartPanelEyebrowCopy,
  chartPanelHeadingCopy,
  chartRangeTabLabel,
  depthEmptyCopy,
  depthSessionLastCopy,
  emptyBookGateCopy,
  feedSurface,
  feedSurfaceCopy,
  feedWithheldCopy,
  isFeedStatus,
  loadingGateCopy,
  nextFeedStatus,
  orderBookCaptionCopy,
  priceChartLabelCopy,
  sessionLastStatLabel,
  staleGateCopy,
  tapeCaptionCopy,
  tapeMiniLabel,
  tapeSideCopy,
  ticketGate,
  unavailableGateCopy,
} from "./market-state.ts";
import { emptyBook } from "./matcher.ts";
import { chartSeries, markets } from "./market-data.ts";

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
  assert.equal(gate.message, emptyBookGateCopy("ZEC-USDC"));
  assert.match(gate.message, /Settled as ZEC-USDC/);
  assert.match(depthEmptyCopy("ZEC-USDC"), /Settled as ZEC-USDC/);
  assert.equal(
    emptyBookGateCopy("ZEC-USDT"),
    "No resting depth. Review is disabled until the local book has size. Settled as ZEC-USDT.",
  );
  assert.equal(
    ticketGate("empty", false, "ZEC-USDT").message,
    emptyBookGateCopy("ZEC-USDT"),
  );
  assert.doesNotMatch(emptyBookGateCopy("ZEC-USDC"), /native ZEC/);
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
  assert.match(loading.message, /Settled as ZEC-USDC/);
  const stale = ticketGate("stale", false, usdt);
  assert.equal(stale.canReview, false);
  assert.equal(stale.asOf, "2026-08-30T16:32:08Z");
  assert.equal(stale.message, staleGateCopy(usdt));
  assert.match(stale.message, /Settled as ZEC-USDT/);
  const unavailable = ticketGate("unavailable", false, usdc);
  assert.equal(unavailable.canReview, false);
  assert.equal(unavailable.message, unavailableGateCopy(usdc));
  assert.doesNotMatch(unavailableGateCopy(usdc), /native ZEC/);
  assert.doesNotMatch(staleGateCopy(usdt), /live feed/);
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
  assert.match(feedSurface("unavailable").statsNote, /withheld/);
  assert.match(feedSurface("empty").statsNote, /withheld/);
  assert.match(feedSurface("unavailable").message, /Integrity checks failed/);
});

test("unavailable withheld copy names ZEC-USDT from real market state", () => {
  assert.equal(markets["ZEC/USDT"].settlementPair, "ZEC-USDT");
  assert.equal(
    feedWithheldCopy("unavailable", markets["ZEC/USDT"].settlementPair),
    "Market data unavailable. Chart and 24h stats are withheld. Integrity checks failed. Settled as ZEC-USDT.",
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
    "Market data unavailable. Chart and 24h stats are withheld. Integrity checks failed. Settled as ZEC-USDC.",
  );
  assert.equal(markets["ZEC/USDC"].settlementPair, "ZEC-USDC");
  assert.equal(markets["ZEC/USDT"].settlementPair, "ZEC-USDT");
  const usdt = feedWithheldCopy("unavailable", markets["ZEC/USDT"].settlementPair);
  assert.equal(
    usdt,
    "Market data unavailable. Chart and 24h stats are withheld. Integrity checks failed. Settled as ZEC-USDT.",
  );
  assert.notEqual(usdc, usdt);
  assert.doesNotMatch(usdt, /native ZEC/);
  assert.doesNotMatch(usdt, /live feed/);
});

test("depth and tape empty copy names the settlement pair", () => {
  assert.equal(
    depthEmptyCopy("ZEC-USDC"),
    "No resting depth. The local book is empty. Settled as ZEC-USDC.",
  );
  assert.equal(
    depthEmptyCopy("ZEC-USDT"),
    "No resting depth. The local book is empty. Settled as ZEC-USDT.",
  );
  assert.match(feedWithheldCopy("unavailable", "ZEC-USDC"), /ZEC-USDC/);
  assert.match(feedWithheldCopy("unavailable", "ZEC-USDT"), /ZEC-USDT/);
  assert.match(feedWithheldCopy("empty", "ZEC-USDC"), /No 24h stats or chart series/);
  assert.match(orderBookCaptionCopy("ZEC/USDC"), /settled as ZEC-USDC/);
  assert.match(orderBookCaptionCopy("ZEC/USDT"), /settled as ZEC-USDT/);
  assert.match(orderBookCaptionCopy("ZEC/USDC"), /cumulative ZEC depth/);
  assert.doesNotMatch(orderBookCaptionCopy("ZEC/USDT"), /pZEC/);
  assert.doesNotMatch(depthEmptyCopy("ZEC-USDC"), /native ZEC/);
  assert.doesNotMatch(feedWithheldCopy("loading", "ZEC-USDC"), /live feed/);
  assert.equal(depthSessionLastCopy("ZEC-USDC", null), "session last · ZEC-USDC");
  assert.equal(
    depthSessionLastCopy("ZEC-USDT", "0.13"),
    "session last · ZEC-USDT · spread 0.13",
  );
  assert.equal(
    tapeCaptionCopy("ZEC/USDC", true),
    "Recent ZEC/USDC trades withheld. Settled as ZEC-USDC. Fixture tape is not shown.",
  );
  assert.match(tapeCaptionCopy("ZEC/USDT", false), /settled as ZEC-USDT/);
  assert.equal(sessionLastStatLabel("ZEC-USDC", true), "Session last · ZEC-USDC");
  assert.equal(sessionLastStatLabel("ZEC-USDT", false), "Session last");
  assert.equal(tapeMiniLabel(false, true, "ZEC-USDC"), "Fixture tape");
  assert.equal(tapeMiniLabel(false, false, "ZEC-USDT"), "Withheld · ZEC-USDT");
  assert.equal(tapeMiniLabel(true, false, "ZEC-USDC"), "Session + fixture");
  assert.equal(chartRangeTabLabel("4H", markets["ZEC/USDC"].settlementPair), "4H · ZEC-USDC");
  assert.equal(chartRangeTabLabel("1D", markets["ZEC/USDT"].settlementPair), "1D · ZEC-USDT");
  assert.doesNotMatch(chartRangeTabLabel("1H", "ZEC-USDC"), /native ZEC/);
  assert.equal(chartPanelHeadingCopy("ZEC/USDC"), "ZEC/USDC · ZEC-USDC");
  assert.equal(chartPanelHeadingCopy("ZEC/USDT"), "ZEC/USDT · ZEC-USDT");
  assert.equal(chartPanelEyebrowCopy(markets["ZEC/USDC"].settlementPair), "Illustrative market data · ZEC-USDC");
  assert.doesNotMatch(chartPanelHeadingCopy("ZEC/USDC"), /native ZEC/);
});

test("price chart label names the settlement pair from real market state", () => {
  const marketId = "ZEC/USDC" as const;
  const range = "4H" as const;
  assert.ok(chartSeries[marketId][range].length > 0);
  assert.equal(markets[marketId].settlementPair, "ZEC-USDC");
  assert.equal(
    priceChartLabelCopy(marketId, range),
    "Illustrative 4H price chart for ZEC/USDC, settled as ZEC-USDC",
  );
  assert.equal(
    priceChartLabelCopy("ZEC/USDT", "1D"),
    "Illustrative 1D price chart for ZEC/USDT, settled as ZEC-USDT",
  );
  assert.equal(
    priceChartLabelCopy(marketId, "1H"),
    "Illustrative 1H price chart for ZEC/USDC, settled as ZEC-USDC",
  );
  assert.ok(chartSeries[marketId]["1H"].length > 0);
  assert.ok(chartSeries[marketId]["1D"].length > 0);
  assert.ok(chartSeries["ZEC/USDT"]["1H"].length > 0);
  assert.ok(chartSeries["ZEC/USDT"]["1D"].length > 0);
  assert.equal(
    priceChartLabelCopy("ZEC/USDT", "1H"),
    "Illustrative 1H price chart for ZEC/USDT, settled as ZEC-USDT",
  );
  assert.equal(
    priceChartLabelCopy("ZEC/USDT", "1D"),
    "Illustrative 1D price chart for ZEC/USDT, settled as ZEC-USDT",
  );
  assert.doesNotMatch(priceChartLabelCopy(marketId, range), /native ZEC/);
  assert.doesNotMatch(priceChartLabelCopy(marketId, range), /live/);
});

test("book side control copy names Bid and Ask in visible control text", () => {
  assert.equal(bookSideControlCopy("ask", "52.91"), "Ask 52.91");
  assert.equal(bookSideControlCopy("bid", "52.78"), "Bid 52.78");
  assert.notEqual(bookSideControlCopy("ask", "52.91"), bookSideControlCopy("bid", "52.91"));
  assert.match(bookSideControlCopy("ask", "52.91"), /Ask/);
  assert.match(bookSideControlCopy("bid", "52.78"), /Bid/);
  assert.doesNotMatch(bookSideControlCopy("ask", "52.91"), /pZEC/);
});

test("tape side copy names Buy and Sell in visible text", () => {
  assert.equal(tapeSideCopy("buy"), "Buy");
  assert.equal(tapeSideCopy("sell"), "Sell");
  assert.notEqual(tapeSideCopy("buy"), tapeSideCopy("sell"));
  assert.match(tapeSideCopy("buy"), /Buy/);
  assert.match(tapeSideCopy("sell"), /Sell/);
  assert.doesNotMatch(tapeSideCopy("buy"), /pZEC/);
  assert.doesNotMatch(tapeSideCopy("buy"), /live/);
  assert.doesNotMatch(tapeSideCopy("sell"), /live/);
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

test("settlement-aware market copy follows the selected pair", () => {
  const usdc = markets["ZEC/USDC"].settlementPair;
  const usdt = markets["ZEC/USDT"].settlementPair;
  assert.equal(usdc, "ZEC-USDC");
  assert.equal(usdt, "ZEC-USDT");
  assert.equal(loadingGateCopy(usdc), "The ticket is waiting for a book snapshot. Retry is safe; nothing was submitted. Settled as ZEC-USDC.");
  assert.equal(staleGateCopy(usdt), "The illustrative feed is marked delayed. Stale data cannot move from preview to confirm. Settled as ZEC-USDT.");
  assert.equal(unavailableGateCopy(usdc), "Integrity checks failed. Preview-to-sign is disabled. Retry is safe; nothing was submitted. Settled as ZEC-USDC.");
  assert.equal(depthEmptyCopy(usdc), "No resting depth. The local book is empty. Settled as ZEC-USDC.");
  assert.equal(feedWithheldCopy("unavailable", usdt), "Market data unavailable. Chart and 24h stats are withheld. Integrity checks failed. Settled as ZEC-USDT.");
  assert.equal(orderBookCaptionCopy("ZEC/USDT").includes("settled as ZEC-USDT"), true);
  assert.equal(depthSessionLastCopy(usdt, "0.13"), "session last · ZEC-USDT · spread 0.13");
  assert.equal(tapeCaptionCopy("ZEC/USDC", true), "Recent ZEC/USDC trades withheld. Settled as ZEC-USDC. Fixture tape is not shown.");
  assert.equal(sessionLastStatLabel(usdc, true), "Session last · ZEC-USDC");
  assert.equal(tapeMiniLabel(false, false, usdt), "Withheld · ZEC-USDT");
  assert.equal(chartRangeTabLabel("1D", usdt), "1D · ZEC-USDT");
  assert.equal(chartPanelHeadingCopy("ZEC/USDC"), "ZEC/USDC · ZEC-USDC");
  assert.equal(chartPanelEyebrowCopy(usdc), "Illustrative market data · ZEC-USDC");
  assert.equal(priceChartLabelCopy("ZEC/USDT", "1H"), "Illustrative 1H price chart for ZEC/USDT, settled as ZEC-USDT");
});
