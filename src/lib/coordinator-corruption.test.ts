import { strict as assert } from "node:assert";
import { test } from "node:test";

import { checkSnapshotIntegrity } from "./coordinator-corruption.ts";
import { emptySnapshot, snapshotFromJSON, snapshotToJSON } from "./coordinator-snapshot.ts";
import { applyTransition, emptyCoordinator } from "./atomic-coordinator.ts";

const FILL_A = "0x" + "aa".repeat(32);

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
  const bad = {
    ...snap,
    fills: [
      {
        fillId: FILL_A,
        evmLeg: { state: "pending", observedAt: "0" },
        zecLeg: { state: "pending", observedAt: "0" },
        evmRefundAfter: "1000",
        zecRefundAfter: "1000",
        disputed: false,
      },
    ],
  };
  const report = checkSnapshotIntegrity(bad);
  assert.equal(report.ok, false);
  assert.match(report.reason ?? "", /non-strict refund deadlines/);
});

test("checkSnapshotIntegrity rejects a snapshot with duplicate fill ids", () => {
  const snap = emptySnapshot();
  const bad = {
    ...snap,
    fills: [
      {
        fillId: FILL_A,
        evmLeg: { state: "pending", observedAt: "0" },
        zecLeg: { state: "pending", observedAt: "0" },
        evmRefundAfter: "500",
        zecRefundAfter: "1500",
        disputed: false,
      },
      {
        fillId: FILL_A,
        evmLeg: { state: "pending", observedAt: "0" },
        zecLeg: { state: "pending", observedAt: "0" },
        evmRefundAfter: "500",
        zecRefundAfter: "1500",
        disputed: false,
      },
    ],
  };
  const report = checkSnapshotIntegrity(bad);
  assert.equal(report.ok, false);
  assert.match(report.reason ?? "", /duplicate fill id/);
});

test("checkSnapshotIntegrity rejects a snapshot with a claimed leg without an observation", () => {
  const snap = emptySnapshot();
  const bad = {
    ...snap,
    fills: [
      {
        fillId: FILL_A,
        evmLeg: { state: "claimed", observedAt: "0" },
        zecLeg: { state: "pending", observedAt: "0" },
        evmRefundAfter: "500",
        zecRefundAfter: "1500",
        disputed: false,
      },
    ],
  };
  const report = checkSnapshotIntegrity(bad);
  assert.equal(report.ok, false);
  assert.match(report.reason ?? "", /without an observed timestamp/);
});

test("snapshotFromJSON throws on a snapshot with non-strict refund deadlines", () => {
  const snap = emptySnapshot();
  const bad = { ...snap, fills: [...snap.fills, {
    fillId: FILL_A,
    evmLeg: { state: "pending", observedAt: "0" },
    zecLeg: { state: "pending", observedAt: "0" },
    evmRefundAfter: "1000",
    zecRefundAfter: "1000",
    disputed: false,
  }] };
  assert.throws(() => snapshotFromJSON(bad), /strictly earlier/);
});
