import Link from "next/link";

import { COUNTRY_ACCESS } from "@/lib/country-access";

import { LandingHeader } from "./landing-header";
import styles from "./landing.module.css";

const statusRows = [
  ["Application", "No-value simulation"],
  ["Matcher", "In-browser; local operator optional"],
  ["Market data", "Fixtures plus local fills"],
  ["Wallets", "Optional Sepolia; legacy only"],
  ["Contracts", "Source in repo, undeployed"],
  ["Asset custody", "Never connected"],
  ["Country access", COUNTRY_ACCESS.default === "deny" && COUNTRY_ACCESS.enabled.length === 0
    ? "Deny by default"
    : "Misconfigured"],
] as const;

const journeys = [
  {
    number: "01",
    label: "Order-book trading",
    title: "Signed limits, visible bounds",
    body: "Submit GTC, IOC, and FOK orders to an in-browser matcher. Market orders are IOC with a user-set worst price. The proposed production matcher remains offchain and is not this simulation.",
    href: "/trade?view=trade",
    link: "Open trade preview",
  },
  {
    number: "02",
    label: "Legacy liquidity simulator",
    title: "A historical pool model",
    body: "Explore the superseded pZEC pool fixture. The native-ZEC target uses wallet-held maker and solver quotes, not passive cross-chain LP shares.",
    href: "/liquidity",
    link: "Open LP preview",
  },
  {
    number: "03",
    label: "Legacy custody simulator",
    title: "A superseded gateway tour",
    body: "Inspect local testnet TEX issuance and the withdrawal fixture. The public app receives no ZEC, mints no pZEC, and this is not the native-settlement target.",
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
        <span>No-value simulation. Optional Sepolia wallet and local testnet services stay off until started. No mainnet funds.</span>
      </div>
      <LandingHeader />

      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroStatement}>
            <span className={styles.eyebrow}>Transparent ZEC markets</span>
            <h1 id="hero-title">Native ZEC,<br />{" "}wallet controlled.</h1>
            <p>
              Phlebas is a production-minded design for ZEC/USDC and ZEC/USDT spot markets,
              an order book designed for auditable sequencing, and two-chain atomic settlement.
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
            <a href="#pzec" className={styles.secondaryCta}>Understand settlement</a>
          </div>
        </section>

        <section className={styles.marketSection} id="markets" aria-labelledby="markets-title">
          <div className={styles.sectionIntro}>
            <span className={styles.eyebrow}>Two focused markets</span>
            <h2 id="markets-title">Familiar labels.<br />Exact settlement.</h2>
            <p>Each target fill exchanges native transparent ZEC for the exact approved stablecoin through wallet-signed conditional locks.</p>
          </div>
          <div className={styles.marketCards}>
            <article>
              <span className={styles.marketIndex}>01</span>
              <div><span>Primary target</span><h3>ZEC / USDC</h3><p>Native ZEC atomic settlement</p></div>
              <Link href={{ pathname: "/trade", query: { view: "trade", market: "ZEC/USDC" } }}>Preview market <span>→</span></Link>
            </article>
            <article>
              <span className={styles.marketIndex}>02</span>
              <div><span>Later listing gate</span><h3>ZEC / USDT</h3><p>Native ZEC atomic settlement</p></div>
              <Link href={{ pathname: "/trade", query: { view: "trade", market: "ZEC/USDT" } }}>Preview market <span>→</span></Link>
            </article>
          </div>
        </section>

        <section className={styles.pzecSection} id="pzec" aria-labelledby="pzec-title">
          <div className={styles.pzecCopy}>
            <span className={styles.eyebrow}>Native settlement target</span>
            <h2 id="pzec-title">Each wallet keeps its own keys.</h2>
            <p>
              Each fill targets one transparent Zcash conditional lock and one exact-token EVM conditional lock. The matcher can coordinate terms, but it cannot spend either asset.
            </p>
            <strong>The pZEC pool and gateway screens remain only as a clearly labeled legacy simulation while the native flow is built.</strong>
          </div>
          <ol className={styles.assetFlow} aria-label="Target native ZEC settlement flow">
            <li><span>01</span><div><strong>Signed order</strong><small>Exact assets, limits, and recipients</small></div></li>
            <li><span>02</span><div><strong>Matched fill</strong><small>Immutable two-chain swap terms</small></div></li>
            <li><span>03</span><div><strong>Wallet funding</strong><small>One conditional lock on each chain</small></div></li>
            <li><span>04</span><div><strong>Claim or refund</strong><small>User-signed terminal action</small></div></li>
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
            <p>Real assets stay blocked until wallet compatibility, atomic-swap protocol and contract, observer, refund and recovery, audit, legal, market-integrity, monitoring, and incident gates have current written evidence.</p>
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
