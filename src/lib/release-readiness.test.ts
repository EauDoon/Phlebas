import { strict as assert } from "node:assert";
import { test } from "node:test";

import { emptyGateResult, evaluateReadiness } from "./release-readiness.ts";

test("evaluateReadiness returns ready when no gates fail", () => {
  const gates = [
    emptyGateResult("lint", "pass", "0 errors"),
    emptyGateResult("typecheck", "pass", "0 errors"),
    emptyGateResult("tests", "pass", "612 pass"),
  ];
  const v = evaluateReadiness(gates, 100n);
  assert.equal(v.ready, true);
  assert.equal(v.failing.length, 0);
  assert.equal(v.passing.length, 3);
  assert.equal(v.skipped.length, 0);
});

test("evaluateReadiness returns not-ready when any gate fails", () => {
  const gates = [
    emptyGateResult("lint", "pass", "0 errors"),
    emptyGateResult("typecheck", "fail", "1 error"),
  ];
  const v = evaluateReadiness(gates, 100n);
  assert.equal(v.ready, false);
  assert.deepEqual(v.failing, ["typecheck"]);
});

test("evaluateReadiness separates skipped from passed and failed", () => {
  const gates = [
    emptyGateResult("lint", "pass", "0 errors"),
    emptyGateResult("contracts", "skip", "no forge locally"),
  ];
  const v = evaluateReadiness(gates, 100n);
  assert.equal(v.ready, true);
  assert.equal(v.passing.length, 1);
  assert.equal(v.skipped.length, 1);
  assert.equal(v.failing.length, 0);
});

test("evaluateReadiness reports the generated timestamp", () => {
  const v = evaluateReadiness([], 500n);
  assert.equal(v.generatedAt, 500n);
  assert.equal(v.ready, true);
});

test("evaluateReadiness rejects a negative now", () => {
  assert.throws(() => evaluateReadiness([], -1n));
});
