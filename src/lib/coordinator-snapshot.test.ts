import { strict as assert } from "node:assert";
import { test } from "node:test";

import { applyTransition, emptyCoordinator } from "./atomic-coordinator.ts";
import {
  SNAPSHOT_FORMAT_VERSION,
  emptySnapshot,
  snapshotFromJSON,
  snapshotToJSON,
} from "./coordinator-snapshot.ts";

const FILL_A = "0x" + "aa".repeat(32);
const FILL_B = "0x" + "bb".repeat(32);

test("emptySnapshot round-trips to an empty coordinator", () => {
  const restored = snapshotFromJSON(emptySnapshot());
  assert.deepEqual(restored, emptyCoordinator());
});

test("snapshotToJSON emits the canonical version and a string cursor", () => {
  const state = applyTransition(emptyCoordinator(), FILL_A, "evm-leg-funded", 100n);
  const snap = snapshotToJSON(state);
  assert.equal(snap.version, SNAPSHOT_FORMAT_VERSION);
  assert.equal(snap.cursor, "1");
  assert.equal(snap.fills.length, 1);
  assert.equal(snap.fills[0].fillId, FILL_A);
});

test("snapshotFromJSON round-trips a multi-fill coordinator", () => {
  let state = emptyCoordinator();
  state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
  state = applyTransition(state, FILL_B, "evm-leg-funded", 200n);
  state = applyTransition(state, FILL_A, "zec-leg-funded", 300n);
  const snap = snapshotToJSON(state);
  const restored = snapshotFromJSON(snap);
  assert.equal(restored.cursor, state.cursor);
  assert.equal(Object.keys(restored.fills).length, 2);
  assert.equal(restored.fills[FILL_A].zecLeg.state, "funded");
  assert.equal(restored.fills[FILL_B].zecLeg.state, "pending");
});

test("snapshotFromJSON rejects an unknown version", () => {
  const snap = emptySnapshot();
  assert.throws(() => snapshotFromJSON({ ...snap, version: 99 as unknown as 1 }));
});

test("snapshotToJSON serializes bigints as decimal strings", () => {
  const state = applyTransition(emptyCoordinator(), FILL_A, "evm-leg-funded", 100n);
  const snap = snapshotToJSON(state);
  const fill = snap.fills[0];
  assert.equal(typeof fill.evmRefundAfter, "string");
  assert.equal(typeof fill.zecRefundAfter, "string");
  assert.equal(typeof fill.evmLeg.observedAt, "string");
});
