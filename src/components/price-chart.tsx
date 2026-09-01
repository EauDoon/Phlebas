import {
  CHART_DISPLAY_HEIGHT,
  CHART_DISPLAY_WIDTH,
  chartDisplayGeometry,
} from "@/lib/chart-display";
import type { ChartRange, MarketId } from "@/lib/market-data";
import { chartSeries, formatSignedChange, markets } from "@/lib/market-data";
import { feedSurface, priceChartLabelCopy, type FeedStatus } from "@/lib/market-state";
import { PRICE_DECIMALS, formatAtomicUnits } from "@/lib/units";

import styles from "./terminal.module.css";

const RANGE_AXIS: Record<ChartRange, readonly [string, string, string]> = {
  "1H": ["-1H", "-30m", "0"],
  "4H": ["-4H", "-2H", "0"],
  "1D": ["-1D", "-12H", "0"],
};

type PriceChartProps = {
  marketId: MarketId;
  range: ChartRange;
  feedStatus: FeedStatus;
};

function plotY(value: number, min: number, max: number) {
  return CHART_DISPLAY_HEIGHT - ((value - min) / (max - min)) * CHART_DISPLAY_HEIGHT;
}

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
  const first = values[0];
  const last = values[values.length - 1];
  const high = Math.max(...values);
  const low = Math.min(...values);
  const lastY = plotY(last, min, max);
  const highY = plotY(high, min, max);
  const lowY = plotY(low, min, max);
  const changeBps = Math.round(((last - first) / first) * 10_000);
  const quote = markets[marketId].quote;
  const lastLabel = formatAtomicUnits(BigInt(last), PRICE_DECIMALS, 2);
  const highLabel = formatAtomicUnits(BigInt(high), PRICE_DECIMALS, 2);
  const lowLabel = formatAtomicUnits(BigInt(low), PRICE_DECIMALS, 2);

  return (
    <div className={styles.chartWrap}>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          top: 8,
          left: 16,
          zIndex: 1,
          display: "flex",
          flexWrap: "wrap",
          alignItems: "baseline",
          gap: "8px 14px",
          pointerEvents: "none",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 11,
        }}
      >
        <span>
          <span className={styles.miniLabel}>Last</span> {lastLabel} {quote}
        </span>
        <span className={changeBps >= 0 ? styles.buyText : styles.sellText}>
          {formatSignedChange(changeBps)} {range}
        </span>
        <span>
          <span className={styles.miniLabel}>High</span> {highLabel}
        </span>
        <span>
          <span className={styles.miniLabel}>Low</span> {lowLabel}
        </span>
      </div>
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
            <stop offset="0%" stopColor="#f0c14b" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#f0c14b" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 1, 2, 3, 4].map((line) => (
          <line
            key={`v-${line}`}
            y1="0"
            y2={CHART_DISPLAY_HEIGHT}
            x1={(CHART_DISPLAY_WIDTH / 4) * line}
            x2={(CHART_DISPLAY_WIDTH / 4) * line}
            className={styles.chartGrid}
          />
        ))}
        {[0, 1, 2, 3].map((line) => (
          <line
            key={`h-${line}`}
            x1="0"
            x2={CHART_DISPLAY_WIDTH}
            y1={(CHART_DISPLAY_HEIGHT / 3) * line}
            y2={(CHART_DISPLAY_HEIGHT / 3) * line}
            className={styles.chartGrid}
          />
        ))}
        <polygon points={areaPoints} fill="url(#chartFill)" />
        <polyline points={points} className={styles.chartLine} />
        <line
          x1="0"
          x2={CHART_DISPLAY_WIDTH}
          y1={lastY.toFixed(1)}
          y2={lastY.toFixed(1)}
          stroke="#f0c14b"
          strokeDasharray="4 4"
          strokeOpacity="0.7"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="0"
          x2="10"
          y1={highY.toFixed(1)}
          y2={highY.toFixed(1)}
          stroke="var(--buy)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1="0"
          x2="10"
          y1={lowY.toFixed(1)}
          y2={lowY.toFixed(1)}
          stroke="var(--sell)"
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div className={styles.chartAxis} aria-hidden="true">
        <span>{formatAtomicUnits(BigInt(max), PRICE_DECIMALS, 2)}</span>
        <span>{formatAtomicUnits(midTicks, PRICE_DECIMALS, 2)}</span>
        <span>{formatAtomicUnits(BigInt(min), PRICE_DECIMALS, 2)}</span>
      </div>
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          right: 52,
          left: 16,
          bottom: 6,
          display: "flex",
          justifyContent: "space-between",
          color: "var(--text-muted)",
          fontFamily: "var(--font-geist-mono), monospace",
          fontSize: 9,
          pointerEvents: "none",
        }}
      >
        {RANGE_AXIS[range].map((label) => (
          <span key={label}>{label}</span>
        ))}
      </div>
    </div>
  );
}
