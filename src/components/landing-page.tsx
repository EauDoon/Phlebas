import Link from "next/link";

import { LandingHeader } from "./landing-header";
import styles from "./landing.module.css";

const statusRows = [
  ["Application", "No-value simulation"],
  ["Market data", "Illustrative fixtures"],
  ["Wallets", "Not connected"],
  ["Contracts", "Not deployed"],
  ["ZEC custody", "Not operating"],
] as const;

const journeys = [
  {
    number: "01",
    label: "Order-book trading",
    title: "Signed limits, visible bounds",
    body: "Preview limit orders or immediate-or-cancel market orders with a user-set worst price. The proposed matcher is offchain; settlement is designed to be atomic and onchain.",
    href: "/trade?view=trade",
    link: "Open trade preview",
  },
  {
    number: "02",
    label: "Simple liquidity",
    title: "Two pools, no incentive maze",
    body: "Explore fixed-fee constant product pools for pZEC/USDC and pZEC/USDT0. No farms, leverage, callbacks, token rewards, or projected returns.",
    href: "/liquidity",
    link: "Open LP preview",
  },
  {
    number: "03",
    label: "Transparent ZEC gateway",
    title: "The custody boundary stays visible",
    body: "Walk through the proposed transparent deposit and withdrawal lifecycle. This preview creates no address, receives no ZEC, and mints no pZEC.",
    href: "/trade?view=bridge",
    link: "See gateway design",
  },
] as const;

export function LandingPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      <div className={styles.simulationBanner} role="status">
        <strong>Simulation only</strong>
        <span>No wallets, real assets, live prices, contracts, deposits, withdrawals, or orders are connected.</span>
      </div>
      <LandingHeader />

      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroStatement}>
            <span className={styles.eyebrow}>Transparent ZEC markets</span>
            <h1 id="hero-title">The custody line,<br />{" "}drawn in public.</h1>
            <p>
              Phlebas is a production-minded design for ZEC/USDC and ZEC/USDT spot markets,
              an order book designed for auditable sequencing, and restrained onchain liquidity.
            </p>
          </div>

          <aside className={styles.systemLedger} aria-labelledby="system-ledger-title">
            <div className={styles.ledgerHeader}>
              <div><span className={styles.eyebrow}>Current system</span><h2 id="system-ledger-title">Nothing hidden behind the preview</h2></div>
              <span className={styles.designPill}>Design only</span>
            </div>
            <dl>
              {statusRows.map(([term, detail]) => (
                <div key={term}><dt>{term}</dt><dd>{detail}</dd></div>
              ))}
            </dl>
            <p>Every displayed price, order, trade, pool reserve, and volume is synthetic.</p>
          </aside>

          <div className={styles.heroActions}>
            <Link href="/trade?view=trade" className={styles.primaryCta}>Enter simulation <span>↗</span></Link>
            <a href="#pzec" className={styles.secondaryCta}>Understand pZEC</a>
          </div>
        </section>

        <section className={styles.marketSection} id="markets" aria-labelledby="markets-title">
          <div className={styles.sectionIntro}>
            <span className={styles.eyebrow}>Two focused markets</span>
            <h2 id="markets-title">Familiar labels.<br />Exact settlement.</h2>
            <p>Phlebas keeps the requested market names while disclosing the receipt and quote token used by the proposed Arbitrum settlement layer.</p>
          </div>
          <div className={styles.marketCards}>
            <article>
              <span className={styles.marketIndex}>01</span>
              <div><span>Primary design</span><h3>ZEC / USDC</h3><p>Settles pZEC / USDC</p></div>
              <Link href={{ pathname: "/trade", query: { view: "trade", market: "ZEC/USDC" } }}>Preview market <span>→</span></Link>
            </article>
            <article>
              <span className={styles.marketIndex}>02</span>
              <div><span>Later listing gate</span><h3>ZEC / USDT</h3><p>Settles pZEC / USDT0</p></div>
              <Link href={{ pathname: "/trade", query: { view: "trade", market: "ZEC/USDT" } }}>Preview market <span>→</span></Link>
            </article>
          </div>
        </section>

        <section className={styles.pzecSection} id="pzec" aria-labelledby="pzec-title">
          <div className={styles.pzecCopy}>
            <span className={styles.eyebrow}>Why pZEC exists</span>
            <h2 id="pzec-title">Native ZEC cannot sit inside an EVM pool.</h2>
            <p>
              Phlebas therefore specifies pZEC, an 8-decimal custody receipt intended to be backed one for one by eligible transparent native ZEC. That choice enables common settlement, but it introduces reserve, signer, redemption, legal, and operator risk.
            </p>
            <strong>pZEC is not native ZEC, shielded ZEC, or a trustless bridge asset.</strong>
          </div>
          <ol className={styles.assetFlow} aria-label="Proposed ZEC to market flow">
            <li><span>01</span><div><strong>Transparent ZEC</strong><small>Unique TEX deposit intent</small></div></li>
            <li><span>02</span><div><strong>Gateway controls</strong><small>Observation, screening, finality</small></div></li>
            <li><span>03</span><div><strong>pZEC on Arbitrum</strong><small>Fully reserved custody receipt</small></div></li>
            <li><span>04</span><div><strong>Trade or LP</strong><small>Onchain CLOB or pool settlement</small></div></li>
          </ol>
        </section>

        <section className={styles.journeySection} id="journeys" aria-labelledby="journeys-title">
          <div className={styles.sectionIntro}>
            <span className={styles.eyebrow}>One product, three journeys</span>
            <h2 id="journeys-title">A narrow surface<br />for each decision.</h2>
          </div>
          <div className={styles.journeyList}>
            {journeys.map((journey) => (
              <article key={journey.number}>
                <span className={styles.journeyNumber}>{journey.number}</span>
                <div><span className={styles.eyebrow}>{journey.label}</span><h3>{journey.title}</h3></div>
                <p>{journey.body}</p>
                <Link href={journey.href}>{journey.link} <span>↗</span></Link>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.gatesSection} id="launch-gates" aria-labelledby="gates-title">
          <div>
            <span className={styles.eyebrow}>Mainnet is not a feature flag</span>
            <h2 id="gates-title">A working preview is not permission to hold funds.</h2>
          </div>
          <div className={styles.gateCopy}>
            <p>Real assets stay blocked until entity, licensing, custody, reserve, signer, audit, market-integrity, jurisdiction, insurance, monitoring, and incident gates have current written evidence.</p>
            <ul>
              <li>USDC is the first proposed quote asset.</li>
              <li>USDT0 requires a separate later listing decision.</li>
              <li>Shielded deposits, leverage, lending, and token incentives remain out of scope.</li>
            </ul>
            <Link href="/trade?view=architecture">Inspect the architecture <span>→</span></Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.brand}><span className={styles.brandMark}>P</span><span>PHLEBAS</span></div>
        <p>Protocol preview, not a live exchange or an offer of financial services.</p>
        <span>30-08-2026</span>
      </footer>
    </div>
  );
}
