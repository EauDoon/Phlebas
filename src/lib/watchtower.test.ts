import { strict as assert } from "node:assert";
import { test } from "node:test";

import { applyTransition, emptyCoordinator, type CoordinatorState } from "./atomic-coordinator.ts";
import { detectAlerts } from "./watchtower.ts";

const FILL_A = "0x" + "aa".repeat(32);

function config() {
  return { reorgDepth: 10n, deadlineBuffer: 60n };
}

test("detectAlerts returns no alerts for a fresh coordinator", () => {
  const state = emptyCoordinator();
  const alerts = detectAlerts(state, 0n, config());
  assert.equal(alerts.length, 0);
});

test("detectAlerts flags a missing-terminal-event when both legs are funded past the deadline", () => {
  let state: CoordinatorState = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  state = applyTransition(state, FILL_A, "zec-leg-funded", 200n);
  // evmRefundAfter is nowSeconds + 900000 from the empty fill default.
  // Way past that with the deadline buffer.
  const alerts = detectAlerts(state, 9_999_999_999n, config());
  const missing = alerts.find((a) => a.alert === "missing-terminal-event");
  assert.ok(missing);
  assert.equal(missing.fillId, FILL_A);
});

test("detectAlerts flags a deadline breach when the EVM refund window has opened", () => {
  let state: CoordinatorState = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  const alerts = detectAlerts(state, 9_999_999_999n, config());
  const breach = alerts.find((a) => a.alert === "deadline-breach");
  assert.ok(breach);
});

test("detectAlerts does not flag a fill that is already settled", () => {
  let state: CoordinatorState = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  state = applyTransition(state, FILL_A, "zec-leg-funded", 200n);
  state = applyTransition(state, FILL_A, "zec-leg-claimed", 300n);
  state = applyTransition(state, FILL_A, "evm-leg-claimed", 400n);
  const alerts = detectAlerts(state, 500n, config());
  const breach = alerts.find((a) => a.fillId === FILL_A);
  assert.equal(breach, undefined);
});

test("detectAlerts aggregates alerts across fills", () => {
  const FILL_B = "0x" + "bb".repeat(32);
  let state: CoordinatorState = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  state = applyTransition(state, FILL_B, "evm-leg-funded", 200n);
  const alerts = detectAlerts(state, 9_999_999_999n, config());
  assert.ok(alerts.length >= 2);
  const fillIds = new Set(alerts.map((a) => a.fillId));
  assert.ok(fillIds.has(FILL_A));
  assert.ok(fillIds.has(FILL_B));
});

test("detectAlerts returns a structured alert with a recommended action", () => {
  let state: CoordinatorState = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  const alerts = detectAlerts(state, 9_999_999_999n, config());
  assert.ok(alerts.length > 0);
  for (const alert of alerts) {
    assert.ok(alert.recommendedAction.length > 0);
    assert.ok(alert.message.length > 0);
  }
});
