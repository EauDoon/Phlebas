import assert from "node:assert/strict";
import test from "node:test";

import { chartDisplayGeometry } from "./chart-display.ts";

test("chart pixel coordinates stay display floats while mid ticks stay integer", () => {
  const geometry = chartDisplayGeometry([4992, 5284], 760, 270);
  assert.match(geometry.points, /\d+\.\d+,\d+\.\d+/);
  assert.equal(typeof geometry.midTicks, "bigint");
  assert.equal(geometry.midTicks, 5138n);
  assert.equal(geometry.min, 4967);
  assert.equal(geometry.max, 5309);
  assert.match(geometry.areaPoints, /^0,270 /);
  assert.match(geometry.areaPoints, / 760,270$/);
});

test("single-value series still produces a display point", () => {
  const geometry = chartDisplayGeometry([5284], 100, 100);
  assert.equal(geometry.points, "0.0,50.0");
  assert.equal(typeof geometry.midTicks, "bigint");
});
