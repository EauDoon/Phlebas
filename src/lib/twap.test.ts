import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isTwapDurationSeconds,
  isTwapSliceCount,
  nextDueTwapSlice,
  isTwapJobTerminal,
  planTwap,
  retainedTwapJobs,
  TWAP_TERMINAL_JOBS_RETAINED,
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

describe("twap job retention", () => {
  const plan = { slices: 4 } as const;
  const running = (id: string, completed = 1) => ({ id, completed, stoppedReason: null, plan });
  const done = (id: string) => ({ id, completed: 4, stoppedReason: null, plan });
  const stopped = (id: string, reason = "Session quote inventory is insufficient") =>
    ({ id, completed: 1, stoppedReason: reason, plan });

  it("keeps a job that just finished, so its closing line can render", () => {
    // The scheduler used to drop a job in the same tick that finished it,
    // which meant "TWAP complete. 4 of 4 slices executed." and the stop
    // reason could never appear: the progress line simply vanished and
    // the visitor was told nothing about whether the order finished or
    // failed. Only the user-cancelled line survived, because the cancel
    // handler publishes the list itself.
    assert.deepEqual(retainedTwapJobs([done("a")]).map((job) => job.id), ["a"]);
    assert.deepEqual(retainedTwapJobs([stopped("b")]).map((job) => job.id), ["b"]);
    assert.deepEqual(
      retainedTwapJobs([stopped("c", TWAP_USER_CANCELLED_REASON)]).map((job) => job.id),
      ["c"],
    );
  });

  it("never drops a running job", () => {
    const jobs = [done("a"), done("b"), done("c"), done("d"), running("live")];
    assert.ok(retainedTwapJobs(jobs).some((job) => job.id === "live"));
  });

  it("keeps the finished list bounded so a long session does not accumulate lines", () => {
    const jobs = [done("a"), done("b"), stopped("c"), done("d"), done("e")];
    assert.equal(TWAP_TERMINAL_JOBS_RETAINED, 3);
    // The oldest finished jobs go first, so the newest outcome stays visible.
    assert.deepEqual(retainedTwapJobs(jobs).map((job) => job.id), ["c", "d", "e"]);
  });

  it("leaves a list that is already within the bound untouched", () => {
    const jobs = [running("x"), done("y")];
    assert.deepEqual(retainedTwapJobs(jobs), jobs);
  });

  it("classifies terminal jobs by completion or stop reason", () => {
    assert.equal(isTwapJobTerminal(running("r")), false);
    assert.equal(isTwapJobTerminal(done("d")), true);
    assert.equal(isTwapJobTerminal(stopped("s")), true);
  });
});
