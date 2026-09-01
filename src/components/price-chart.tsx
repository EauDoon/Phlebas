import {
  CHART_DISPLAY_HEIGHT,
  CHART_DISPLAY_WIDTH,
  chartDisplayGeometry,
} from "@/lib/chart-display";
import type { ChartRange, MarketId } from "@/lib/market-data";
import { chartSeries } from "@/lib/market-data";
import { feedSurface, priceChartLabelCopy, type FeedStatus } from "@/lib/market-state";
import { PRICE_DECIMALS, formatAtomicUnits } from "@/lib/units";

import styles from "./terminal.module.css";

type PriceChartProps = {
  marketId: MarketId;
  range: ChartRange;
  feedStatus: FeedStatus;
};

export function PriceChart({ marketId, range, feedStatus }: PriceChartProps) {
  const surface = feedSurface(feedStatus);
  if (!surface.showFixtures) {
    return (
      <div className={styles.chartWrap}>
        <p className={styles.emptyState} role="status" aria-label="Chart empty state">
          <strong>{surface.heading}. </strong>
          {surface.message}
        </p>
      </div>
    );
  }
  const values = chartSeries[marketId][range];
  const chartLabel = priceChartLabelCopy(marketId, range);
  const { min, max, midTicks, points, areaPoints } = chartDisplayGeometry(values);

  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${CHART_DISPLAY_WIDTH} ${CHART_DISPLAY_HEIGHT}`}
        role="img"
        aria-label={chartLabel}
        preserveAspectRatio="none"
      >
        <title>
          {chartLabel}
        </title>
        <defs>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#2dd4bf" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => (
          <line
            key={line}
            x1="0"
            x2={CHART_DISPLAY_WIDTH}
            y1={(CHART_DISPLAY_HEIGHT / 3) * line}
            y2={(CHART_DISPLAY_HEIGHT / 3) * line}
            className={styles.chartGrid}
          />
        ))}
        <polygon points={areaPoints} fill="url(#chartFill)" />
        <polyline points={points} className={styles.chartLine} />
      </svg>
      <div className={styles.chartAxis} aria-hidden="true">
        <span>{formatAtomicUnits(BigInt(max), PRICE_DECIMALS, 2)}</span>
        <span>{formatAtomicUnits(midTicks, PRICE_DECIMALS, 2)}</span>
        <span>{formatAtomicUnits(BigInt(min), PRICE_DECIMALS, 2)}</span>
      </div>
    </div>
  );
}
