import assert from "node:assert/strict";
import test from "node:test";

import { applyChartRangeKey, CHART_RANGES, isChartRange, nextChartRange } from "./chart-ranges.ts";

test("chart ranges wrap under arrow deltas", () => {
  assert.deepEqual([...CHART_RANGES], ["1H", "4H", "1D"]);
  assert.equal(isChartRange("4H"), true);
  assert.equal(isChartRange("1W"), false);
  assert.equal(nextChartRange("1H", 1), "4H");
  assert.equal(nextChartRange("1D", 1), "1H");
  assert.equal(nextChartRange("1H", -1), "1D");
  assert.equal(nextChartRange("4H", 2), "1H");
  assert.equal(nextChartRange("1H", -4), "1D");
});

test("chart range tabs follow roving keys", () => {
  assert.equal(applyChartRangeKey("1H", "ArrowRight"), "4H");
  assert.equal(applyChartRangeKey("1D", "ArrowDown"), "1H");
  assert.equal(applyChartRangeKey("1H", "ArrowLeft"), "1D");
  assert.equal(applyChartRangeKey("4H", "Home"), "1H");
  assert.equal(applyChartRangeKey("4H", "End"), "1D");
  assert.equal(applyChartRangeKey("4H", "Enter"), "4H");
  assert.equal(applyChartRangeKey("4H", "g"), null);
});
