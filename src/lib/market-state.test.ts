import assert from "node:assert/strict";
import test from "node:test";

import {
  FEED_STATUS_LABELS,
  FEED_STATUSES,
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
  nextFeedStatus,
  priceChartLabelCopy,
  sessionLastStatLabel,
  staleGateCopy,
  loadingGateCopy,
  unavailableGateCopy,
  orderBookCaptionCopy,
  tapeCaptionCopy,
  tapeMiniLabel,
  ticketGate,
} from "./market-state.ts";
import { emptyBook } from "./matcher.ts";
import { markets } from "./market-data.ts";

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

test("settlement-aware market copy follows the selected pair", () => {
  const usdc = markets["ZEC/USDC"].settlementPair;
  const usdt = markets["ZEC/USDT"].settlementPair;
  assert.equal(loadingGateCopy(usdc), "The ticket is waiting for a book snapshot. Retry is safe; nothing was submitted. Settled as pZEC-USDC.");
  assert.equal(staleGateCopy(usdt), "The illustrative feed is marked delayed. Stale data cannot move from preview to confirm. Settled as pZEC-USDT0.");
  assert.equal(unavailableGateCopy(usdc), "Integrity checks failed. Preview-to-sign is disabled. Retry is safe; nothing was submitted. Settled as pZEC-USDC.");
  assert.equal(depthEmptyCopy(usdc), "No resting depth. The local book is empty. Settled as pZEC-USDC.");
  assert.equal(feedWithheldCopy("unavailable", usdt), "Market data unavailable. Chart and 24h stats are withheld. Integrity checks failed. Settled as pZEC-USDT0.");
  assert.equal(orderBookCaptionCopy("ZEC/USDT").includes("settled as pZEC-USDT0"), true);
  assert.equal(depthSessionLastCopy(usdt, "0.13"), "session last · pZEC-USDT0 · spread 0.13");
  assert.equal(tapeCaptionCopy("ZEC/USDC", true), "Recent ZEC/USDC trades withheld. Settled as pZEC-USDC. Fixture tape is not shown.");
  assert.equal(sessionLastStatLabel(usdc, true), "Session last · pZEC-USDC");
  assert.equal(tapeMiniLabel(false, false, usdt), "Withheld · pZEC-USDT0");
  assert.equal(chartRangeTabLabel("1D", usdt), "1D · pZEC-USDT0");
  assert.equal(chartPanelHeadingCopy("ZEC/USDC"), "ZEC/USDC · pZEC-USDC");
  assert.equal(chartPanelEyebrowCopy(usdc), "Illustrative market data · pZEC-USDC");
  assert.equal(priceChartLabelCopy("ZEC/USDT", "1H"), "Illustrative 1H price chart for ZEC/USDT, settled as pZEC-USDT0");
});
