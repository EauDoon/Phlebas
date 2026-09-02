import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isTwapDurationSeconds,
  isTwapSliceCount,
  nextDueTwapSlice,
  planTwap,
  TWAP_DURATION_SECONDS,
  TWAP_SLICES,
  TWAP_USER_CANCELLED_REASON,
  twapCancelCopy,
  twapProgressCopy,
  twapSliceSizes,
  twapStopCopy,
} from "./twap.ts";

// Deterministic PRNG (mulberry32) so a failure is reproducible from the
// printed seed instead of depending on Math.random's run-to-run state.
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

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

  it("conserves the total and never regresses in size across many random inputs", () => {
    // Property test: for any supported slice count and any positive total,
    // the slices must sum to exactly the total (no atom created, dropped,
    // or double-counted), every slice must be a non-negative integer, and
    // sizes must be non-increasing left to right (planTwap's minimum-
    // settlement check assumes the last slice is the smallest one).
    const random = mulberry32(0xf0face);
    for (let trial = 0; trial < 5_000; trial += 1) {
      const slices = TWAP_SLICES[Math.floor(random() * TWAP_SLICES.length)];
      const total = BigInt(Math.floor(random() * 50_000_000) + 1);
      const sizes = twapSliceSizes(total, slices);

      const sum = sizes.reduce((accumulator, size) => accumulator + size, 0n);
      assert.equal(sum, total, `trial ${trial}: sizes summed to ${sum}, expected ${total} (slices=${slices})`);

      for (const size of sizes) {
        assert.ok(size >= 0n, `trial ${trial}: negative slice size ${size} (slices=${slices}, total=${total})`);
      }
      for (let index = 1; index < sizes.length; index += 1) {
        assert.ok(
          sizes[index] <= sizes[index - 1],
          `trial ${trial}: slice ${index} (${sizes[index]}) exceeds slice ${index - 1} (${sizes[index - 1]})`,
        );
      }
    }
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

  it("keeps every schedule inside its duration window and conserves size, for every supported combination", () => {
    // Exhaustive over the small enumerated domain (4 slice counts x 3
    // durations): due times must start at startUnix, strictly increase,
    // never reach past the requested duration, and slice sizes must still
    // sum to the total.
    for (const slices of TWAP_SLICES) {
      for (const durationSeconds of TWAP_DURATION_SECONDS) {
        const plan = planTwap({
          totalSizeAtoms: 100_000_000n,
          priceTicks: 1_000_000n,
          slices,
          durationSeconds,
          startUnix: 10_000n,
        });
        assert.equal(plan.dueAtUnix[0], 10_000n);
        for (let index = 1; index < plan.dueAtUnix.length; index += 1) {
          assert.ok(plan.dueAtUnix[index] > plan.dueAtUnix[index - 1], "due times must strictly increase");
        }
        const last = plan.dueAtUnix[plan.dueAtUnix.length - 1];
        assert.ok(last - 10_000n < BigInt(durationSeconds), "last slice must fire before the duration elapses");
        assert.equal(plan.sliceSizes.reduce((total, size) => total + size, 0n), 100_000_000n);
      }
    }
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
