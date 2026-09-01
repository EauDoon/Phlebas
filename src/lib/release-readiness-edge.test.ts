import { strict as assert } from "node:assert";
import { test } from "node:test";

import { emptyGateResult, evaluateReadiness } from "./release-readiness.ts";

test("evaluateReadiness handles an empty gate list", () => {
  const v = evaluateReadiness([], 100n);
  assert.equal(v.ready, false);
  assert.equal(v.passing.length, 0);
  assert.equal(v.failing.length, 7);
  assert.ok(v.failing.every((name) => name.startsWith("missing:")));
  assert.equal(v.skipped.length, 0);
});

test("evaluateReadiness preserves gate order in passing and failing", () => {
  const gates = [
    emptyGateResult("lint", "pass", "0 errors"),
    emptyGateResult("typecheck", "fail", "1 error"),
    emptyGateResult("tests", "pass", "612 pass"),
    emptyGateResult("audit", "skip", "manual review"),
  ];
  const v = evaluateReadiness(gates, 100n);
  assert.deepEqual(v.passing, ["lint", "tests"]);
  assert.equal(v.failing[0], "typecheck");
  assert.ok(v.failing.includes("missing:contracts"));
  assert.deepEqual(v.skipped, ["audit"]);
});

test("evaluateReadiness returns not ready when only skips are present", () => {
  const v = evaluateReadiness([
    emptyGateResult("contracts", "skip", "no forge"),
    emptyGateResult("audit", "skip", "manual"),
  ], 100n);
  assert.equal(v.ready, false);
  assert.equal(v.passing.length, 0);
  assert.equal(v.skipped.length, 2);
});
