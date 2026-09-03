import { strict as assert } from "node:assert";
import { test } from "node:test";

import { emptyGateResult, evaluateReadiness, REQUIRED_RELEASE_GATES, type GateResult } from "./release-readiness.ts";

function allPassing() {
  return REQUIRED_RELEASE_GATES.map((name) => emptyGateResult(name, "pass", "ok"));
}

test("evaluateReadiness returns ready when no gates fail", () => {
  const gates = allPassing();
  const v = evaluateReadiness(gates, 100n);
  assert.equal(v.ready, true);
  assert.equal(v.failing.length, 0);
  assert.equal(v.passing.length, REQUIRED_RELEASE_GATES.length);
  assert.equal(v.skipped.length, 0);
});

test("evaluateReadiness returns not-ready when any gate fails", () => {
  const gates = allPassing().map((gate) => gate.name === "typecheck"
    ? emptyGateResult("typecheck", "fail", "1 error")
    : gate);
  const v = evaluateReadiness(gates, 100n);
  assert.equal(v.ready, false);
  assert.deepEqual(v.failing, ["typecheck"]);
});

test("evaluateReadiness treats a skipped required gate as not ready", () => {
  const gates = allPassing().map((gate) => gate.name === "contracts"
    ? emptyGateResult("contracts", "skip", "not run")
    : gate);
  const v = evaluateReadiness(gates, 100n);
  assert.equal(v.ready, false);
  assert.equal(v.passing.length, REQUIRED_RELEASE_GATES.length - 1);
  assert.equal(v.skipped.length, 1);
  assert.equal(v.failing.length, 0);
});

test("evaluateReadiness reports the generated timestamp", () => {
  const v = evaluateReadiness([], 500n);
  assert.equal(v.generatedAt, 500n);
  assert.equal(v.ready, false);
});

test("evaluateReadiness rejects a negative now", () => {
  assert.throws(() => evaluateReadiness([], -1n));
});

test("evaluateReadiness rejects a missing required gate", () => {
  const v = evaluateReadiness(allPassing().filter((gate) => gate.name !== "contracts"), 100n);
  assert.equal(v.ready, false);
  assert.ok(v.failing.includes("missing:contracts"));
});

test("evaluateReadiness rejects duplicate gate identities", () => {
  const gates = [...allPassing(), emptyGateResult("lint", "pass", "duplicate")];
  const v = evaluateReadiness(gates, 100n);
  assert.equal(v.ready, false);
  assert.ok(v.failing.includes("duplicate:lint"));
});

test("runtime status corruption cannot pass a required or additional gate", () => {
  for (const status of ["ready", "PASS", "", null, undefined, true]) {
    const invalid = { name: "lint", status, detail: "unverified" } as unknown as GateResult;
    for (const gates of [allPassing().map((gate) => gate.name === "lint" ? invalid : gate),
      [...allPassing(), { ...invalid, name: "extra-review" }]]) {
      const verdict = evaluateReadiness(gates, 100n);
      assert.equal(verdict.ready, false);
      assert.ok(verdict.failing.some((name) => name.startsWith("invalid-status:")));
    }
  }
});

test("browser acceptance is mandatory and cannot be skipped", () => {
  const missing = evaluateReadiness(allPassing().filter((gate) => gate.name !== "browser"), 100n);
  assert.equal(missing.ready, false);
  assert.ok(missing.failing.includes("missing:browser"));
  const skipped = evaluateReadiness(allPassing().map((gate) => gate.name === "browser"
    ? { ...gate, status: "skip" } : gate), 100n);
  assert.equal(skipped.ready, false);
  assert.deepEqual(skipped.skipped, ["browser"]);
});

test("malformed gate identities, evidence details and clocks fail closed", () => {
  for (const gate of [null, { name: " lint", status: "pass", detail: "ok" },
    { name: "", status: "pass", detail: "ok" }, { name: "lint", status: "pass", detail: " " }]) {
    assert.throws(() => evaluateReadiness([gate as GateResult], 100n), /Release gates/);
  }
  assert.throws(() => evaluateReadiness(allPassing(), 100 as unknown as bigint), /bigint/);
});
