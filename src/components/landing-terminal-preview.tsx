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
    <section className={styles.terminalPreviewSection} id="terminal-preview" tabIndex={-1} aria-labelledby="terminal-preview-title" data-reveal>
      <div className={styles.sectionIntro}>
        <span className={styles.eyebrow}>{LANDING_TERMINAL_PREVIEW.eyebrow}</span>
        <h2 id="terminal-preview-title">{LANDING_TERMINAL_PREVIEW.heading}</h2>
        <p>{LANDING_TERMINAL_PREVIEW.supporting}</p>
      </div>

      <article className={styles.terminalPreviewFrame}>
        <div className={styles.terminalPreviewHeader}>
          <div>
            <span className={styles.designPill}>{LANDING_TERMINAL_PREVIEW.chip}</span>
            <strong>One liquidity layer. Two ways to trade.</strong>
          </div>
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

        <div className={styles.terminalModeRail} aria-label="Trading modes">
          <span><strong>Simple</strong> Market swap</span>
          <span><strong>Advanced</strong> Order book</span>
        </div>

        <div className={styles.previewPairRail} aria-label="Available markets">
          <span aria-current="true">ZEC / USDC</span>
          <span>ZEC / USDT</span>
        </div>

        <div className={styles.terminalPreviewBody}>
          <section className={styles.simplePreview} aria-labelledby="simple-preview-title">
            <div className={styles.simplePreviewHead}>
              <div>
                <span className={styles.eyebrow}>Simple</span>
                <h3 id="simple-preview-title">Swap from the shared book</h3>
              </div>
              <span>0.50% max</span>
            </div>
            <div className={styles.previewTokenCard}>
              <span>You pay</span>
              <strong>529.10 <small>USDC</small></strong>
              <small>Illustrative session inventory</small>
            </div>
            <span className={styles.previewSwitch} aria-hidden="true">↓</span>
            <div className={styles.previewTokenCard}>
              <span>You receive</span>
              <strong>10.00 <small>ZEC</small></strong>
              <small>IOC through the same order book</small>
            </div>
            <button type="button" disabled>Review swap</button>
          </section>

          <section className={styles.advancedPreview} aria-labelledby="advanced-preview-title">
            <div className={styles.simplePreviewHead}>
              <div>
                <span className={styles.eyebrow}>Advanced</span>
                <h3 id="advanced-preview-title">Work the order book</h3>
              </div>
              <span>Limit · Market · TWAP planned</span>
            </div>
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
          </section>
        </div>
      </article>

      <Link href={LANDING_TERMINAL_PREVIEW.href} className={styles.primaryCta}>{LANDING_TERMINAL_PREVIEW.cta} <span>↗</span></Link>
    </section>
  );
}
