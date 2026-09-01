import type { ChartRange } from "./market-data.ts";
import { applyRovingAction, interpretRovingKey } from "./roving-keys.ts";

export const CHART_RANGES = ["1H", "4H", "1D"] as const satisfies readonly ChartRange[];

export function isChartRange(value: string | undefined): value is ChartRange {
  return CHART_RANGES.includes(value as ChartRange);
}

export function nextChartRange(id: ChartRange, delta: number): ChartRange {
  const count = CHART_RANGES.length;
  const from = CHART_RANGES.indexOf(id);
  const index = ((from + delta) % count + count) % count;
  return CHART_RANGES[index];
}

export function applyChartRangeKey(id: ChartRange, key: string): ChartRange | null {
  const action = interpretRovingKey(key);
  if (!action) return null;
  return applyRovingAction(CHART_RANGES, id, action);
}
