import { IncidentDemo } from "./incident-demo";
import styles from "./terminal.module.css";

const layers = [
  {
    label: "Public interface",
    title: "Vercel web application",
    items: ["Read-only fixture market data", "In-browser matcher; optional Sepolia signing", "Loopback gateway and matcher never hosted on Vercel", "No custody keys or Zcash node"],
  },
  {
    label: "Trading network",
    title: "Matcher and Arbitrum contracts",
    items: ["Offchain matcher, not trustless", "Onchain atomic settlement", "Constrained constant product pools", "USDT0 is a later listing gate"],
  },
  {
    label: "Zcash gateway",
    title: "Dedicated custody environment",
    items: ["Independent Zebra observers", "Threshold mint and withdrawal authorization", "Transparent ZEC UTXO accounting", "Public reserve and liability proofs"],
  },
];

export function ArchitecturePanel() {
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
      <div className={styles.layerGrid}>
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
      <IncidentDemo />
      <div className={styles.honestyBar}>
        <strong>Proposed product label</strong>
        <span>Designed as a hybrid DEX with an offchain matcher, onchain settlement, constrained AMM contracts, and a custody-backed ZEC gateway. The matcher is not trustless. Mainnet access policy remains unresolved.</span>
      </div>
    </section>
  );
}
