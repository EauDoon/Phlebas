import Link from "next/link";

import { COUNTRY_ACCESS } from "@/lib/country-access";

import { LandingHeader } from "./landing-header";
import { LandingJourneys } from "./landing-journeys";
import styles from "./landing.module.css";

const statusRows = [
  ["Application", "No-value simulation"],
  ["Matcher", "In-browser; local operator optional"],
  ["Market data", "Fixtures plus local fills"],
  ["Wallets", "Optional Arbitrum Sepolia"],
  ["Contracts", "Source in repo, undeployed"],
  ["ZEC custody", "Not operating"],
  ["Country access", COUNTRY_ACCESS.default === "deny" && COUNTRY_ACCESS.enabled.length === 0
    ? "Deny by default"
    : "Misconfigured"],
] as const;

export function LandingPage() {
  return (
    <div className={styles.page}>
      <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      <div className={styles.simulationBanner} role="status">
        <strong>Simulation only</strong>
        <span>No-value simulation. Optional Sepolia wallet and local testnet services stay off until started. No mainnet funds.</span>
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
            <p>Phlebas presents native ZEC against native USDC and native USDT. This preview still moves no live funds.</p>
          </div>
          <div className={styles.marketCards}>
            <article>
              <span className={styles.marketIndex}>01</span>
              <div><span>Native pair</span><h3>ZEC / USDC</h3><p>Settles ZEC / USDC</p></div>
              <Link href={{ pathname: "/trade", query: { view: "trade", market: "ZEC/USDC" } }}>Preview market <span>→</span></Link>
            </article>
            <article>
              <span className={styles.marketIndex}>02</span>
              <div><span>Native pair</span><h3>ZEC / USDT</h3><p>Settles ZEC / USDT</p></div>
              <Link href={{ pathname: "/trade", query: { view: "trade", market: "ZEC/USDT" } }}>Preview market <span>→</span></Link>
            </article>
          </div>
        </section>

        <section className={styles.pzecSection} id="pzec" aria-labelledby="pzec-title">
          <div className={styles.pzecCopy}>
            <span className={styles.eyebrow}>Native assets</span>
            <h2 id="pzec-title">Native ZEC against native USDC and USDT.</h2>
            <p>
              The simulation now labels settlement as ZEC-USDC and ZEC-USDT. It does not wrap ZEC as pZEC and it does not list USDT0. Shielded ZEC stays out of scope. No live funds move in this preview.
            </p>
            <strong>This is a no-value simulation. It is not a live exchange and not a shielded market.</strong>
          </div>
          <ol className={styles.assetFlow} aria-label="Proposed ZEC to market flow">
            <li><span>01</span><div><strong>Transparent ZEC</strong><small>Unique TEX deposit intent</small></div></li>
            <li><span>02</span><div><strong>Gateway controls</strong><small>Observation, screening, finality</small></div></li>
            <li><span>03</span><div><strong>Native ZEC settlement</strong><small>ZEC-USDC and ZEC-USDT pairs</small></div></li>
            <li><span>04</span><div><strong>Trade or LP</strong><small>Offchain matcher, onchain settlement or pool swap</small></div></li>
          </ol>
        </section>

        <LandingJourneys />

        <section className={styles.gatesSection} id="launch-gates" aria-labelledby="gates-title">
          <div>
            <span className={styles.eyebrow}>Mainnet is not a feature flag</span>
            <h2 id="gates-title">A working preview is not permission to hold funds.</h2>
          </div>
          <div className={styles.gateCopy}>
            <p>Real assets stay blocked until entity, licensing, custody, reserve, signer, audit, market-integrity, jurisdiction, insurance, monitoring, and incident gates have current written evidence.</p>
            <ul>
              <li>USDC and USDT are both native quote assets in this preview.</li>
              <li>USDT0 is abandoned. It is not a listed settlement asset.</li>
              <li>Shielded deposits, leverage, lending, and token incentives remain out of scope.</li>
            </ul>
            <Link href="/trade?view=architecture">Inspect the architecture <span>→</span></Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.brand}><span className={styles.brandMark}>P</span><span>PHLEBAS</span></div>
        <p>Protocol preview, not a live exchange or an offer of financial services.</p>
        <p>
          <Link href="/status">Status</Link>
          {" · "}
          <Link href="/legal">Legal</Link>
          {" · "}
          <Link href="/security">Security</Link>
        </p>
        <span>31-08-2026</span>
      </footer>
    </div>
  );
}
