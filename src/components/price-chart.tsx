import type { ChartRange, MarketId } from "@/lib/market-data";
import { chartSeries } from "@/lib/market-data";
import { feedSurface, type FeedStatus } from "@/lib/market-state";
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
      <p className={styles.emptyState} role="status">
        <strong>{surface.heading}. </strong>
        {surface.message}
      </p>
    );
  }
  const values = chartSeries[marketId][range];
  const min = Math.min(...values) - 25;
  const max = Math.max(...values) + 25;
  const width = 760;
  const height = 270;
  const points = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * width;
      const y = height - ((value - min) / (max - min)) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  const areaPoints = `0,${height} ${points} ${width},${height}`;
  const midTicks = BigInt(Math.trunc((min + max) / 2));

  return (
    <div className={styles.chartWrap}>
      <svg
        className={styles.chart}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Illustrative ${range} price chart for ${marketId}`}
        preserveAspectRatio="none"
      >
        <title>{`Illustrative ${range} price chart for ${marketId}`}</title>
        <defs>
          <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f4c95d" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#f4c95d" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3].map((line) => (
          <line
            key={line}
            x1="0"
            x2={width}
            y1={(height / 3) * line}
            y2={(height / 3) * line}
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
