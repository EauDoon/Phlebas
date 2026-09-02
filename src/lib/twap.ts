// TWAP (time-weighted average price) order planning.
//
// A TWAP instruction splits one reviewed size into equal slices executed
// at fixed intervals across a duration. Planning is pure: the same size,
// slice count, duration, and start time always yield the same schedule.
// Each slice must independently settle (meet the minimum quote
// settlement); a plan whose slices cannot settle is rejected here rather
// than discovered mid-execution.

import type { MarketId } from "./market-data.ts";
import { meetsMinimumQuoteSettlement } from "./units.ts";

export const TWAP_SLICES = [2, 4, 6, 12] as const;
export type TwapSliceCount = (typeof TWAP_SLICES)[number];

export const TWAP_DURATION_SECONDS = [300, 900, 3600] as const;
export type TwapDurationSeconds = (typeof TWAP_DURATION_SECONDS)[number];

export const TWAP_DURATION_LABELS: Readonly<Record<TwapDurationSeconds, string>> = Object.freeze({
  300: "5 minutes",
  900: "15 minutes",
  3600: "1 hour",
});

export type TwapPlan = Readonly<{
  totalSizeAtoms: bigint;
  slices: TwapSliceCount;
  durationSeconds: TwapDurationSeconds;
  startUnix: bigint;
  /** Size of every slice; earlier slices carry the rounding remainder. */
  sliceSizes: readonly bigint[];
  /** Unix second each slice becomes due; slice 0 is due immediately. */
  dueAtUnix: readonly bigint[];
}>;

export function isTwapSliceCount(value: number): value is TwapSliceCount {
  return (TWAP_SLICES as readonly number[]).includes(value);
}

export function isTwapDurationSeconds(value: number): value is TwapDurationSeconds {
  return (TWAP_DURATION_SECONDS as readonly number[]).includes(value);
}

/** Split total into `slices` near-equal sizes; the remainder goes to the earliest slices. */
export function twapSliceSizes(totalSizeAtoms: bigint, slices: TwapSliceCount): readonly bigint[] {
  if (totalSizeAtoms <= 0n) throw new RangeError("TWAP size must be positive");
  const base = totalSizeAtoms / BigInt(slices);
  const remainder = totalSizeAtoms % BigInt(slices);
  return Array.from({ length: slices }, (_, index) => (BigInt(index) < remainder ? base + 1n : base));
}

export function planTwap(input: {
  totalSizeAtoms: bigint;
  priceTicks: bigint;
  slices: number;
  durationSeconds: number;
  startUnix: bigint;
}): TwapPlan {
  const { totalSizeAtoms, priceTicks, startUnix } = input;
  if (!isTwapSliceCount(input.slices)) throw new RangeError("TWAP slice count is unsupported");
  if (!isTwapDurationSeconds(input.durationSeconds)) throw new RangeError("TWAP duration is unsupported");
  if (startUnix < 0n) throw new RangeError("TWAP start time must be non-negative");
  const slices = input.slices;
  const durationSeconds = input.durationSeconds;

  const sliceSizes = twapSliceSizes(totalSizeAtoms, slices);
  const minimum = sliceSizes.at(-1) ?? 0n;
  if (!meetsMinimumQuoteSettlement(minimum, priceTicks)) {
    throw new RangeError("Each TWAP slice must settle to at least one quote atom");
  }

  const interval = BigInt(Math.floor(durationSeconds / slices));
  const dueAtUnix = Array.from({ length: slices }, (_, index) => startUnix + BigInt(index) * interval);

  return Object.freeze({
    totalSizeAtoms,
    slices,
    durationSeconds,
    startUnix,
    sliceSizes: Object.freeze(sliceSizes),
    dueAtUnix: Object.freeze(dueAtUnix),
  });
}

/** The next slice index that is due at or before `nowUnix`, or null when idle. */
export function nextDueTwapSlice(plan: TwapPlan, nowUnix: bigint, completed: number): number | null {
  if (completed >= plan.slices) return null;
  return nowUnix >= plan.dueAtUnix[completed] ? completed : null;
}

export function twapProgressCopy(plan: TwapPlan, completed: number): string {
  if (completed >= plan.slices) {
    return `TWAP complete. ${plan.slices} of ${plan.slices} slices executed.`;
  }
  return `TWAP running. ${completed} of ${plan.slices} slices executed.`;
}

export function twapStopCopy(plan: TwapPlan, completed: number, reason: string): string {
  const punctuated = reason.endsWith(".") ? reason : `${reason}.`;
  return `TWAP stopped after ${completed} of ${plan.slices} slices. ${punctuated}`;
}

export const TWAP_USER_CANCELLED_REASON = "Cancelled by you. Remaining slices will not execute." as const;

export function twapCancelCopy(plan: TwapPlan, completed: number): string {
  return `TWAP cancelled after ${completed} of ${plan.slices} slices. Remaining slices will not execute.`;
}

export function twapSessionLogId(marketId: MarketId, jobNumber: number): string {
  return `twap-${marketId.replace("/", "").toLowerCase()}-${jobNumber}`;
}
