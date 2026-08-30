import type { ChartRange, MarketId } from "@/lib/market-data";
import { chartSeries } from "@/lib/market-data";

import styles from "./terminal.module.css";

type PriceChartProps = {
  marketId: MarketId;
  range: ChartRange;
};

export function PriceChart({ marketId, range }: PriceChartProps) {
  const values = chartSeries[marketId][range];
  const min = Math.min(...values) - 0.25;
  const max = Math.max(...values) + 0.25;
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
        <span>{max.toFixed(2)}</span>
        <span>{((min + max) / 2).toFixed(2)}</span>
        <span>{min.toFixed(2)}</span>
      </div>
    </div>
  );
}
