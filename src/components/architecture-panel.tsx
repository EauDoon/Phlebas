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
        <span>Designed as a non-custodial exchange with an offchain matcher and wallet-signed native-ZEC atomic settlement. The matcher is not trustless. It can censor or delay orders. Mainnet access policy remains unresolved.</span>
      </div>
      <IncidentDemo />
    </section>
  );
}
