import { strict as assert } from "node:assert";
import { test } from "node:test";

import { checkSnapshotIntegrity } from "./coordinator-corruption.ts";
import { emptySnapshot, snapshotFromJSON, snapshotToJSON, type SnapshotFill } from "./coordinator-snapshot.ts";
import { applyTransition, emptyCoordinator } from "./atomic-coordinator.ts";
import type { Hex32 } from "./order-domain.ts";

const FILL_A = ("0x" + "aa".repeat(32)) as Hex32;

function fill(id: Hex32, evmRefundAfter: string, zecRefundAfter: string, evmState: string, zecState: string, evmObs: string, zecObs: string): SnapshotFill {
  return {
    fillId: id,
    evmLeg: { state: evmState as SnapshotFill["evmLeg"]["state"], observedAt: evmObs },
    zecLeg: { state: zecState as SnapshotFill["zecLeg"]["state"], observedAt: zecObs },
    evmRefundAfter,
    zecRefundAfter,
    disputed: false,
  };
}

test("checkSnapshotIntegrity accepts an empty snapshot", () => {
  const report = checkSnapshotIntegrity(emptySnapshot());
  assert.equal(report.ok, true);
});

test("checkSnapshotIntegrity accepts a populated snapshot", () => {
  const state = applyTransition(emptyCoordinator(), FILL_A, "evm-leg-funded", 100n);
  const snap = snapshotToJSON(state);
  const report = checkSnapshotIntegrity(snap);
  assert.equal(report.ok, true);
});

test("checkSnapshotIntegrity rejects a snapshot with non-strict refund deadlines", () => {
  const snap = emptySnapshot();
  const bad = { ...snap, fills: [fill(FILL_A, "1000", "1000", "pending", "pending", "0", "0")] };
  const report = checkSnapshotIntegrity(bad);
  assert.equal(report.ok, false);
  assert.match(report.reason ?? "", /non-strict refund deadlines/);
});

test("checkSnapshotIntegrity rejects a snapshot with duplicate fill ids", () => {
  const snap = emptySnapshot();
  const bad = {
    ...snap,
    fills: [
      fill(FILL_A, "500", "1500", "pending", "pending", "0", "0"),
      fill(FILL_A, "500", "1500", "pending", "pending", "0", "0"),
    ],
  };
  const report = checkSnapshotIntegrity(bad);
  assert.equal(report.ok, false);
  assert.match(report.reason ?? "", /duplicate fill id/);
});

test("checkSnapshotIntegrity rejects a snapshot with a claimed leg without an observation", () => {
  const snap = emptySnapshot();
  const bad = { ...snap, fills: [fill(FILL_A, "500", "1500", "claimed", "pending", "0", "0")] };
  const report = checkSnapshotIntegrity(bad);
  assert.equal(report.ok, false);
  assert.match(report.reason ?? "", /without an observed timestamp/);
});

test("snapshotFromJSON throws on a snapshot with non-strict refund deadlines", () => {
  const snap = emptySnapshot();
  const bad = { ...snap, fills: [fill(FILL_A, "1000", "1000", "pending", "pending", "0", "0")] };
  assert.throws(() => snapshotFromJSON(bad), /strictly earlier/);
});
