import type { MarketId } from "@/lib/market-data";
import { markets } from "@/lib/market-data";
import { feedSurface, type FeedStatus } from "@/lib/market-state";
import { levelsFromBook, type Book } from "@/lib/matcher";
import { PRICE_DECIMALS, PZEC_DECIMALS, formatAtomicUnits } from "@/lib/units";

import styles from "./terminal.module.css";

export function OrderBook({
  marketId,
  book,
  onPriceSelect,
  feedStatus = "illustrative",
}: {
  marketId: MarketId;
  book: Book;
  onPriceSelect: (priceTicks: bigint) => void;
  feedStatus?: FeedStatus;
}) {
  const market = markets[marketId];
  const surface = feedSurface(feedStatus);
  const asks = surface.showFixtures ? levelsFromBook(book, "sell") : [];
  const bids = surface.showFixtures ? levelsFromBook(book, "buy") : [];
  const askRows = [...asks].reverse();
  const maxAtoms = [...asks, ...bids].reduce((max, level) => (
    level.totalAtoms > max ? level.totalAtoms : max
  ), 1n);
  const spreadTicks = asks[0] && bids[0] ? asks[0].priceTicks - bids[0].priceTicks : null;

  return (
    <section className={styles.panel} aria-labelledby="order-book-title">
      <div className={styles.panelHeader}>
        <h2 id="order-book-title">Order book</h2>
        <span className={styles.miniLabel}>0.01 tick · local book</span>
      </div>
      <table className={styles.dataTable}>
        <caption className={styles.srOnly}>
          Local {marketId} order book. Totals are cumulative pZEC depth from the best price. Click a price to copy it into the ticket.
        </caption>
        <thead>
          <tr>
            <th scope="col">Price {market.quote}</th>
            <th scope="col">Size pZEC</th>
            <th scope="col">Total pZEC</th>
          </tr>
        </thead>
        <tbody aria-label="Asks">
          {askRows.length === 0 && bids.length === 0 && (
            <tr>
              <td colSpan={3}>
                <p className={styles.emptyState}>
                  {surface.showFixtures || feedStatus === "empty"
                    ? "No resting depth. The local book is empty."
                    : `${surface.heading}. ${surface.message}`}
                </p>
              </td>
            </tr>
          )}
          {askRows.map((level) => (
            <BookRow
              key={`ask-${level.priceTicks.toString()}`}
              side="sell"
              level={level}
              maxAtoms={maxAtoms}
              onPriceSelect={onPriceSelect}
            />
          ))}
          <tr className={styles.midPriceRow}>
            <td colSpan={3}>
              <div className={styles.midPrice}>
                <strong>{formatAtomicUnits(book.lastTicks, PRICE_DECIMALS, 2)}</strong>
                <span>
                  session last
                  {spreadTicks !== null ? ` · spread ${formatAtomicUnits(spreadTicks, PRICE_DECIMALS, 2)}` : ""}
                </span>
              </div>
            </td>
          </tr>
        </tbody>
        <tbody aria-label="Bids">
          {bids.map((level) => (
            <BookRow
              key={`bid-${level.priceTicks.toString()}`}
              side="buy"
              level={level}
              maxAtoms={maxAtoms}
              onPriceSelect={onPriceSelect}
            />
          ))}
        </tbody>
      </table>
    </section>
  );
}

function BookRow({
  side,
  level,
  maxAtoms,
  onPriceSelect,
}: {
  side: "buy" | "sell";
  level: { priceTicks: bigint; sizeAtoms: bigint; totalAtoms: bigint };
  maxAtoms: bigint;
  onPriceSelect: (priceTicks: bigint) => void;
}) {
  const depthPercent = Number((level.totalAtoms * 1000n) / maxAtoms) / 10;
  const label = side === "buy" ? "Bid" : "Ask";

  return (
    <tr>
      <th scope="row" className={side === "buy" ? styles.buyText : styles.sellText}>
        <span
          className={styles.depthFill}
          style={{
            width: `${Math.min(100, depthPercent)}%`,
            background: side === "buy" ? "var(--buy-soft)" : "var(--sell-soft)",
          }}
          aria-hidden="true"
        />
        <button
          type="button"
          className={styles.bookButton}
          onClick={() => onPriceSelect(level.priceTicks)}
        >
          <span className={styles.srOnly}>{label} </span>
          {formatAtomicUnits(level.priceTicks, PRICE_DECIMALS, 2)}
        </button>
      </th>
      <td>{formatAtomicUnits(level.sizeAtoms, PZEC_DECIMALS, 2)}</td>
      <td>{formatAtomicUnits(level.totalAtoms, PZEC_DECIMALS, 2)}</td>
    </tr>
  );
}
