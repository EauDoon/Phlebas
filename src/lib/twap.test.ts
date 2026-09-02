import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isTwapDurationSeconds,
  isTwapSliceCount,
  nextDueTwapSlice,
  planTwap,
  TWAP_USER_CANCELLED_REASON,
  twapCancelCopy,
  twapProgressCopy,
  twapSliceSizes,
  twapStopCopy,
} from "./twap.ts";

describe("twap slice sizing", () => {
  it("splits evenly and carries the remainder on the earliest slices", () => {
    assert.deepEqual(twapSliceSizes(10n, 4), [3n, 3n, 2n, 2n]);
    assert.deepEqual(twapSliceSizes(8n, 4), [2n, 2n, 2n, 2n]);
    assert.deepEqual(twapSliceSizes(1n, 4), [1n, 0n, 0n, 0n]);
  });

  it("slices always sum to the total", () => {
    const sizes = twapSliceSizes(1_234_567n, 12);
    assert.equal(sizes.reduce((total, size) => total + size, 0n), 1_234_567n);
  });

  it("rejects non-positive sizes", () => {
    assert.throws(() => twapSliceSizes(0n, 4), /must be positive/);
  });
});

describe("twap planning", () => {
  it("produces a deterministic schedule with slice 0 due immediately", () => {
    const plan = planTwap({
      totalSizeAtoms: 1_000_000n,
      priceTicks: 5_000n,
      slices: 4,
      durationSeconds: 900,
      startUnix: 1_000n,
    });
    assert.deepEqual([...plan.dueAtUnix], [1000n, 1225n, 1450n, 1675n]);
    assert.equal(plan.sliceSizes[0] * 4n, 1_000_000n);
  });

  it("rejects unsupported slice counts and durations", () => {
    assert.throws(() => planTwap({ totalSizeAtoms: 10n, priceTicks: 5n, slices: 3, durationSeconds: 300, startUnix: 0n }), /slice count/);
    assert.throws(() => planTwap({ totalSizeAtoms: 10n, priceTicks: 5n, slices: 4, durationSeconds: 60, startUnix: 0n }), /duration/);
  });

  it("rejects slices too small to settle", () => {
    assert.throws(
      () => planTwap({ totalSizeAtoms: 4n, priceTicks: 5_000n, slices: 4, durationSeconds: 900, startUnix: 0n }),
      /settle/,
    );
  });

  it("guards the count and duration discriminators", () => {
    assert.equal(isTwapSliceCount(4), true);
    assert.equal(isTwapSliceCount(3), false);
    assert.equal(isTwapDurationSeconds(900), true);
    assert.equal(isTwapDurationSeconds(60), false);
  });
});

describe("twap execution helpers", () => {
  const plan = planTwap({
    totalSizeAtoms: 1_000_000n,
    priceTicks: 5_000n,
    slices: 4,
    durationSeconds: 900,
    startUnix: 1_000n,
  });

  it("reports the first uncompleted slice only once its time has arrived", () => {
    assert.equal(nextDueTwapSlice(plan, 999n, 0), null);
    assert.equal(nextDueTwapSlice(plan, 1_000n, 0), 0);
    assert.equal(nextDueTwapSlice(plan, 1_200n, 1), null);
    assert.equal(nextDueTwapSlice(plan, 1_225n, 1), 1);
  });

  it("goes idle when every slice is completed", () => {
    assert.equal(nextDueTwapSlice(plan, 9_999n, 4), null);
  });

  it("formats progress and stop copy", () => {
    assert.equal(twapProgressCopy(plan, 2), "TWAP running. 2 of 4 slices executed.");
    assert.equal(twapProgressCopy(plan, 4), "TWAP complete. 4 of 4 slices executed.");
    assert.equal(
      twapStopCopy(plan, 1, "Session quote inventory is insufficient"),
      "TWAP stopped after 1 of 4 slices. Session quote inventory is insufficient.",
    );
  });

  it("formats a user-cancelled stop distinct from a rejection stop", () => {
    assert.equal(
      twapCancelCopy(plan, 3),
      "TWAP cancelled after 3 of 4 slices. Remaining slices will not execute.",
    );
    assert.equal(TWAP_USER_CANCELLED_REASON, "Cancelled by you. Remaining slices will not execute.");
  });
});
