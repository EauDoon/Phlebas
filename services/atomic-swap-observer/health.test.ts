import { strict as assert } from "node:assert";
import { test } from "node:test";

import { applyTransition, emptyCoordinator } from "../../src/lib/atomic-coordinator.ts";
import { buildHealth } from "./health.ts";

const FILL_A = "0x" + "aa".repeat(32);

test("buildHealth returns an ok report for a ready bootstrap", () => {
  const state = applyTransition(emptyCoordinator(), FILL_A, "evm-leg-funded", 100n);
  const h = buildHealth(state, 10n, 15n, "ready");
  assert.equal(h.ok, true);
  assert.equal(h.bootstrap, "ready");
  assert.equal(h.fillCount, 1);
  assert.equal(h.cursor, "1");
  assert.equal(h.alertCount, 0);
  assert.equal(h.reorgDepth, 10n);
  assert.equal(h.pollIntervalSeconds, 15n);
});

test("buildHealth reports not-ok for a missing bootstrap", () => {
  const h = buildHealth(emptyCoordinator(), 10n, 15n, "missing");
  assert.equal(h.ok, false);
  assert.equal(h.bootstrap, "missing");
});

test("buildHealth reports not-ok for an error bootstrap", () => {
  const h = buildHealth(emptyCoordinator(), 10n, 15n, "error");
  assert.equal(h.ok, false);
  assert.equal(h.bootstrap, "error");
});

test("buildHealth reflects alert log growth", () => {
  let state = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  state = applyTransition(state, FILL_A, "evm-leg-funded", 200n);
  const h = buildHealth(state, 10n, 15n, "ready");
  assert.equal(h.alertCount, 1);
});
