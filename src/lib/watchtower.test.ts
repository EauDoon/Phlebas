import { strict as assert } from "node:assert";
import { test } from "node:test";

import { applyTransition, emptyCoordinator, type CoordinatorState } from "./atomic-coordinator.ts";
import { detectAlerts } from "./watchtower.ts";

const FILL_A = "0x" + "aa".repeat(32);

function config() {
  return { reorgWindowSeconds: 120n, deadlineBuffer: 60n };
}

test("detectAlerts returns no alerts for a fresh coordinator", () => {
  const state = emptyCoordinator();
  const alerts = detectAlerts(state, 0n, config());
  assert.equal(alerts.length, 0);
});

test("detectAlerts flags a missing-terminal-event when both legs are funded past the deadline", () => {
  const firstObservedAt = 1_780_000_000n;
  let state: CoordinatorState = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", firstObservedAt);
  state = applyTransition(state, FILL_A, "zec-leg-funded", firstObservedAt + 1n);
  const fill = state.fills[FILL_A];
  assert.ok(fill);
  const evmRefundAfter = fill.evmRefundAfter;
  assert.equal(evmRefundAfter, firstObservedAt + 900_000n);

  const atBoundary = detectAlerts(state, evmRefundAfter + config().deadlineBuffer, config());
  assert.equal(atBoundary.find((alert) => alert.alert === "missing-terminal-event"), undefined);

  const alerts = detectAlerts(state, evmRefundAfter + config().deadlineBuffer + 1n, config());
  const missing = alerts.find((a) => a.alert === "missing-terminal-event");
  assert.ok(missing);
  assert.equal(missing.fillId, FILL_A);
  assert.match(missing.message, new RegExp(String(evmRefundAfter + config().deadlineBuffer)));
});

test("detectAlerts flags a deadline breach when the EVM refund window has opened", () => {
  let state: CoordinatorState = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  const alerts = detectAlerts(state, 9_999_999_999n, config());
  const breach = alerts.find((a) => a.alert === "deadline-breach");
  assert.ok(breach);
});

function settledFill(): CoordinatorState {
  let state: CoordinatorState = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  state = applyTransition(state, FILL_A, "zec-leg-funded", 200n);
  state = applyTransition(state, FILL_A, "zec-leg-claimed", 300n);
  state = applyTransition(state, FILL_A, "evm-leg-claimed", 400n);
  return state;
}

test("detectAlerts does not flag a settled fill once its reorganization window has passed", () => {
  // The claim was observed at 400 and the window is 120s, so by 600 it is
  // past reorganization and there is nothing left to warn about.
  const alerts = detectAlerts(settledFill(), 600n, config());
  assert.equal(alerts.find((a) => a.fillId === FILL_A), undefined);
});

test("detectAlerts flags a settled fill that is still inside the reorganization window", () => {
  // This is the alert's entire purpose: a terminal event that a
  // reorganization could still undo. The comparison used to be made
  // against reorgDepth, a count of blocks, so with a depth of 10 the
  // window was ten raw seconds and this alert effectively never fired.
  // A claim seen 100 seconds ago is well inside a 120-second window.
  const alerts = detectAlerts(settledFill(), 500n, config());
  const alert = alerts.find((a) => a.fillId === FILL_A);
  assert.equal(alert?.alert, "reorg-depth-exceeded");
  assert.match(alert?.message ?? "", /120s reorganization window/);
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
