import Link from "next/link";

import { LANDING_LEDGER, LANDING_TERMINAL_PREVIEW } from "@/lib/landing-copy";
import { books, markets } from "@/lib/market-data";
import { PRICE_DECIMALS, ZEC_DECIMALS, formatAtomicUnits } from "@/lib/units";

import styles from "./landing.module.css";

const market = markets["ZEC/USDC"];
const book = books["ZEC/USDC"];
const asks = [...book.asks.slice(-3)].reverse();
const bids = book.bids.slice(0, 3);
const marketData = LANDING_LEDGER.find((row) => row.label === "Market data")?.value ?? "Illustrative";

export function LandingTerminalPreview() {
  return (
    <section className={styles.terminalPreviewSection} id="terminal-preview" tabIndex={-1} aria-labelledby="terminal-preview-title">
      <div className={styles.sectionIntro}>
        <span className={styles.eyebrow}>{LANDING_TERMINAL_PREVIEW.eyebrow}</span>
        <h2 id="terminal-preview-title">{LANDING_TERMINAL_PREVIEW.heading}</h2>
        <p>{LANDING_TERMINAL_PREVIEW.supporting}</p>
      </div>

      <article className={styles.terminalPreviewFrame}>
        <div className={styles.terminalPreviewHeader}>
          <span className={styles.designPill}>{LANDING_TERMINAL_PREVIEW.chip}</span>
          <p>ZEC / USDC · settles {market.settlementPair.replace("-", " / ")}</p>
        </div>

        <dl className={styles.terminalPreviewSummary} aria-label="Market summary">
          <div>
            <dt>{LANDING_TERMINAL_PREVIEW.lastLabel}</dt>
            <dd>{formatAtomicUnits(market.lastTicks, PRICE_DECIMALS, 2)} {market.quote}</dd>
          </div>
          <div>
            <dt>{LANDING_TERMINAL_PREVIEW.marketDataLabel}</dt>
            <dd>{marketData}</dd>
          </div>
        </dl>

        <div className={styles.terminalPreviewGrid}>
          <table className={styles.terminalPreviewBook}>
            <caption>{market.id} depth. {LANDING_TERMINAL_PREVIEW.bound}</caption>
            <thead>
              <tr>
                <th scope="col">Side</th>
                <th scope="col">Price {market.quote}</th>
                <th scope="col">Size ZEC</th>
              </tr>
            </thead>
            <tbody>
              {asks.map((level) => (
                <tr key={`ask-${level.priceTicks}`}>
                  <th scope="row">Ask</th>
                  <td>{formatAtomicUnits(level.priceTicks, PRICE_DECIMALS, 2)}</td>
                  <td>{formatAtomicUnits(level.sizeAtoms, ZEC_DECIMALS)}</td>
                </tr>
              ))}
              {bids.map((level) => (
                <tr key={`bid-${level.priceTicks}`}>
                  <th scope="row">Bid</th>
                  <td>{formatAtomicUnits(level.priceTicks, PRICE_DECIMALS, 2)}</td>
                  <td>{formatAtomicUnits(level.sizeAtoms, ZEC_DECIMALS)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <aside className={styles.terminalPreviewTicket}>
            <span className={styles.eyebrow}>{LANDING_TERMINAL_PREVIEW.ticketEyebrow}</span>
            <p>{LANDING_TERMINAL_PREVIEW.ticketSummary}</p>
            <p>{LANDING_TERMINAL_PREVIEW.bound}</p>
          </aside>
        </div>
      </article>

      <Link href={LANDING_TERMINAL_PREVIEW.href} className={styles.primaryCta}>{LANDING_TERMINAL_PREVIEW.cta} <span>↗</span></Link>
    </section>
  );
}
