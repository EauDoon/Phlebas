import Link from "next/link";

import { IncidentDemo } from "./incident-demo";
import styles from "./terminal.module.css";

const layers = [
  {
    label: "Public interface",
    title: "Vercel web application",
    items: ["Read-only illustrative market data", "In-browser matcher; optional Sepolia signing", "No local operator service is hosted on Vercel", "No custody keys or Zcash node"],
  },
  {
    label: "Trading network",
    title: "Matcher and Arbitrum contracts",
    items: ["Offchain matcher, not trustless", "Atomic settlement target", "Wallet-held maker and solver quotes", "Native ZEC, native USDC, native USDT"],
  },
  {
    label: "Historical custody model",
    title: "Removed from runtime",
    items: ["No gateway or reserve keys", "No address generation or wallet handoff", "No mint, burn, or payout authority", "Wallet-controlled conditional locks are the target"],
  },
];

export function ArchitecturePanel({ highlightIncidents = false }: { highlightIncidents?: boolean }) {
  return (
    <section className={`${styles.panel} ${styles.architecture}`} aria-labelledby="architecture-title">
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Reference architecture</span>
          <h2 id="architecture-title">Three separated trust zones</h2>
        </div>
        <span className={styles.statusDot}>Design only</span>
      </div>
      <p className={styles.featureLead}>
        The public UI must never become the custody backend. Each layer receives only the
        authority it needs. Any implemented cross-layer message must be replay-protected and auditable.
      </p>
      <div
        id="architecture-layers"
        className={styles.layerGrid}
        role="region"
        aria-label="Architecture layers"
        tabIndex={-1}
      >
        {layers.map((layer, index) => (
          <article key={layer.title} className={styles.layerCard}>
            <span className={styles.layerNumber}>0{index + 1}</span>
            <span className={styles.eyebrow}>{layer.label}</span>
            <h3>{layer.title}</h3>
            <ul className={styles.cleanList}>
              {layer.items.map((item) => <li key={item}>{item}</li>)}
            </ul>
          </article>
        ))}
      </div>
      <div
        id="honesty-bar"
        className={styles.honestyBar}
        role="region"
        aria-label="Architecture honesty bar"
        tabIndex={-1}
      >
        <strong>Target product boundary</strong>
        <span>Native settlement target: a non-custodial interface with user-signed actions and an offchain matcher. The matcher is not trustless. It can censor or delay orders. Mainnet access policy remains unresolved.</span>
      </div>
      <nav className={styles.architectureLinks} aria-label="Settlement and launch">
        <Link href="/trade?view=settlement">How settlement works</Link>
        <Link href="/#launch-gates">Launch gates</Link>
      </nav>
      <section
        id="historical-models"
        aria-labelledby="historical-models-title"
        tabIndex={-1}
      >
        <div className={styles.honestyBar}>
          <strong id="historical-models-title">Historical models</strong>
          <span className={styles.warningPill}>Retired</span>
          <span>
            Custody and AMM tours remain reachable. They are not the current liquidity product.
            {" "}
            <Link href="/trade?view=bridge">Deposit states</Link>
            {" · "}
            <Link href="/trade?view=bridge&journey=withdrawal">Withdrawal states</Link>
            {" · "}
            <Link href="/liquidity#historical-amm">Historical AMM model</Link>
          </span>
        </div>
      </section>
      <IncidentDemo highlight={highlightIncidents} />
    </section>
  );
}
