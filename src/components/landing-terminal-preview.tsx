import Link from "next/link";

import { books, markets } from "@/lib/market-data";
import { PRICE_DECIMALS, PZEC_DECIMALS, formatAtomicUnits } from "@/lib/units";

import styles from "./landing.module.css";

const market = markets["ZEC/USDC"];
const book = books["ZEC/USDC"];
const asks = [...book.asks.slice(-3)].reverse();
const bids = book.bids.slice(0, 3);

export function LandingTerminalPreview() {
  return (
    <section className={styles.terminalPreviewSection} id="terminal-preview" tabIndex={-1} aria-labelledby="terminal-preview-title">
      <div className={styles.sectionIntro}>
        <span className={styles.eyebrow}>Interface preview</span>
        <h2 id="terminal-preview-title">Inspect the market model without connecting a wallet.</h2>
        <p>
          Change a fixture, preview an order, inspect pool math, and walk through gateway states.
          Values are illustrative and actions remain inside the browser.
        </p>
      </div>

      <div className={styles.terminalPreviewFrame}>
        <div className={styles.terminalPreviewHeader}>
          <span className={styles.designPill}>Simulation</span>
          <p>ZEC / USDC · settles {market.settlementPair.replace("-", " / ")}</p>
        </div>

        <dl className={styles.terminalPreviewSummary} aria-label="Illustrative market summary">
          <div>
            <dt>Last</dt>
            <dd>{formatAtomicUnits(market.lastTicks, PRICE_DECIMALS, 2)} {market.quote}</dd>
          </div>
          <div>
            <dt>Market data</dt>
            <dd>Illustrative fixtures</dd>
          </div>
        </dl>

        <div className={styles.terminalPreviewGrid}>
          <table className={styles.terminalPreviewBook}>
            <caption>Illustrative {market.id} depth. Not a live book.</caption>
            <thead>
              <tr>
                <th scope="col">Side</th>
                <th scope="col">Price {market.quote}</th>
                <th scope="col">Size pZEC</th>
              </tr>
            </thead>
            <tbody>
              {asks.map((level) => (
                <tr key={`ask-${level.priceTicks}`}>
                  <th scope="row">Ask</th>
                  <td>{formatAtomicUnits(level.priceTicks, PRICE_DECIMALS, 2)}</td>
                  <td>{formatAtomicUnits(level.sizeAtoms, PZEC_DECIMALS)}</td>
                </tr>
              ))}
              {bids.map((level) => (
                <tr key={`bid-${level.priceTicks}`}>
                  <th scope="row">Bid</th>
                  <td>{formatAtomicUnits(level.priceTicks, PRICE_DECIMALS, 2)}</td>
                  <td>{formatAtomicUnits(level.sizeAtoms, PZEC_DECIMALS)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className={styles.terminalPreviewTicket}>
            <span className={styles.eyebrow}>Order ticket</span>
            <p>Buy · Limit · 10 pZEC</p>
            <p>Illustrative entry only. This frame cannot submit, sign, or fill.</p>
          </div>
        </div>
      </div>

      <Link href="/trade?view=trade" className={styles.primaryCta}>Open full simulation <span>↗</span></Link>
    </section>
  );
}
