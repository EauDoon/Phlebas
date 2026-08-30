import type { MarketId } from "@/lib/market-data";
import { books, markets } from "@/lib/market-data";

import styles from "./terminal.module.css";

export function OrderBook({ marketId }: { marketId: MarketId }) {
  const book = books[marketId];
  const market = markets[marketId];

  return (
    <section className={styles.panel} aria-labelledby="order-book-title">
      <div className={styles.panelHeader}>
        <h2 id="order-book-title">Order book</h2>
        <span className={styles.miniLabel}>0.01 tick</span>
      </div>
      <table className={styles.dataTable}>
        <caption className={styles.srOnly}>
          Illustrative {marketId} order book. Totals are cumulative pZEC depth from the best price.
        </caption>
        <thead>
          <tr>
            <th scope="col">Price {market.quote}</th>
            <th scope="col">Size pZEC</th>
            <th scope="col">Total pZEC</th>
          </tr>
        </thead>
        <tbody aria-label="Asks">
          {book.asks.map((level) => (
            <tr key={`ask-${level.price}`}>
              <th scope="row" className={styles.sellText}><span className={styles.srOnly}>Ask </span>{level.price.toFixed(2)}</th>
              <td>{level.size.toFixed(2)}</td>
              <td>{level.total.toFixed(2)}</td>
            </tr>
          ))}
          <tr className={styles.midPriceRow}>
            <td colSpan={3}>
              <div className={styles.midPrice}>
                <strong>{market.last.toFixed(2)}</strong>
                <span>illustrative mid</span>
              </div>
            </td>
          </tr>
        </tbody>
        <tbody aria-label="Bids">
          {book.bids.map((level) => (
            <tr key={`bid-${level.price}`}>
              <th scope="row" className={styles.buyText}><span className={styles.srOnly}>Bid </span>{level.price.toFixed(2)}</th>
              <td>{level.size.toFixed(2)}</td>
              <td>{level.total.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
