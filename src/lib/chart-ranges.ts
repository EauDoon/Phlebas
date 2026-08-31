import type { ChartRange } from "./market-data.ts";

export const CHART_RANGES = ["1H", "4H", "1D"] as const satisfies readonly ChartRange[];

export function isChartRange(value: string | undefined): value is ChartRange {
  return CHART_RANGES.includes(value as ChartRange);
}

export function nextChartRange(id: ChartRange, delta: number): ChartRange {
  const count = CHART_RANGES.length;
  const index = (CHART_RANGES.indexOf(id) + delta + count) % count;
  return CHART_RANGES[index];
}
