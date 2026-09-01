import assert from "node:assert/strict";
import test from "node:test";

import { LANDING_EVIDENCE } from "./landing-evidence.ts";

test("landing evidence is four bounded preview rows", () => {
  assert.equal(LANDING_EVIDENCE.length, 4);
  assert.deepEqual(LANDING_EVIDENCE.map((row) => row.title), [
    "Order book preview",
    "LP math preview",
    "Historical custody model",
    "Published boundary",
  ]);
});

test("landing evidence does not solicit deposits or project returns", () => {
  for (const row of LANDING_EVIDENCE) {
    assert.doesNotMatch(row.body, /\blive\b/i);
    assert.doesNotMatch(row.body, /shielded/i);
    assert.doesNotMatch(row.body, /is trustless/);
    assert.doesNotMatch(row.body, /APY|APR|earn|yield/i);
  }
  assert.match(LANDING_EVIDENCE[1].body, /no return projection/);
  assert.match(LANDING_EVIDENCE[2].body, /no address generation/);
  assert.match(LANDING_EVIDENCE[2].body, /keyless tour/);
});
