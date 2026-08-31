import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  applyAlert,
  applyTransition,
  emptyCoordinator,
  getFill,
  isFillTerminal,
  listAlerts,
  listFills,
  nextActionFor,
  type CoordinatorState,
} from "./atomic-coordinator.ts";

const FILL_A = "0x" + "aa".repeat(32);
const FILL_B = "0x" + "bb".repeat(32);

test("emptyCoordinator has no fills and no alerts", () => {
  const state = emptyCoordinator();
  assert.equal(listFills(state).length, 0);
  assert.equal(listAlerts(state).length, 0);
});

test("applyTransition creates a fill on the first transition", () => {
  const state = applyTransition(emptyCoordinator(), FILL_A, "evm-leg-funded", 100n);
  const fill = getFill(state, FILL_A);
  assert.ok(fill);
  assert.equal(state.cursor, 1n);
});

test("applyTransition increments the cursor on each transition", () => {
  let state: CoordinatorState = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  state = applyTransition(state, FILL_A, "zec-leg-funded", 200n);
  state = applyTransition(state, FILL_A, "zec-leg-claimed", 300n);
  state = applyTransition(state, FILL_A, "evm-leg-claimed", 400n);
  assert.equal(state.cursor, 4n);
  assert.equal(isFillTerminal(state, FILL_A), true);
});

test("applyTransition records an alert and does not advance the cursor on a rejected transition", () => {
  let state: CoordinatorState = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  assert.equal(state.cursor, 1n);
  const alerts = listAlerts(state);
  assert.equal(alerts.length, 1);
  assert.equal(alerts[0].fillId, FILL_A);
});

test("applyAlert appends to the alert log without touching fills", () => {
  let state: CoordinatorState = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  const beforeCursor = state.cursor;
  state = applyAlert(state, FILL_A, "reorg-depth-exceeded", 200n);
  assert.equal(state.cursor, beforeCursor);
  assert.equal(listAlerts(state).length, 1);
});

test("nextActionFor delegates to the underlying state machine", () => {
  let state: CoordinatorState = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  assert.equal(nextActionFor(state, FILL_A, 100n, "buyer"), "wait-for-zec-fund");
  assert.equal(nextActionFor(state, FILL_A, 100n, "seller"), "fund-zec");
});

test("listFills aggregates all known fills", () => {
  let state: CoordinatorState = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  state = applyTransition(state, FILL_B, "evm-leg-funded", 200n);
  assert.equal(listFills(state).length, 2);
});

test("nextActionFor returns unknown-fill for a fill that does not exist", () => {
  const state = emptyCoordinator();
  assert.equal(nextActionFor(state, FILL_A, 100n, "buyer"), "unknown-fill");
});
