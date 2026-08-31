/**
 * SVG pixel layout for the illustrative price chart.
 *
 * Financial ticks stay integer. Pixel x/y may be IEEE floats because the
 * browser paints the polyline in CSS pixels. That is a display exception,
 * not a conversion used for quotes, fills, or inventory.
 */
export const CHART_DISPLAY_WIDTH = 760;
export const CHART_DISPLAY_HEIGHT = 270;
export const CHART_DISPLAY_PAD_TICKS = 25;

export type ChartDisplayGeometry = {
  min: number;
  max: number;
  midTicks: bigint;
  points: string;
  areaPoints: string;
};

export function chartDisplayGeometry(
  values: readonly number[],
  width = CHART_DISPLAY_WIDTH,
  height = CHART_DISPLAY_HEIGHT,
): ChartDisplayGeometry {
  const min = Math.min(...values) - CHART_DISPLAY_PAD_TICKS;
  const max = Math.max(...values) + CHART_DISPLAY_PAD_TICKS;
  const points = values
    .map((value, index) => {
      const x = values.length === 1 ? 0 : (index / (values.length - 1)) * width;
      const y = height - ((value - min) / (max - min)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return {
    min,
    max,
    midTicks: BigInt(Math.trunc((min + max) / 2)),
    points,
    areaPoints: `0,${height} ${points} ${width},${height}`,
  };
}
