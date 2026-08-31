import styles from "./terminal.module.css";

const layers = [
  {
    label: "Public interface",
    title: "Vercel web application",
    items: ["Read-only fixture market data", "In-browser matcher; optional Sepolia signing", "Loopback gateway and matcher never hosted on Vercel", "No custody keys or Zcash node"],
  },
  {
    label: "Trading coordination",
    title: "Order intake and matcher",
    items: ["Signed, replay-protected intents", "Auditable intake receipts", "Deterministic price-time matching", "Cannot spend user assets"],
  },
  {
    label: "Two-chain settlement",
    title: "Wallet-controlled conditional locks",
    items: ["Native transparent ZEC leg", "Exact stablecoin EVM leg", "Independent read-only observers", "Wallet-held claim and refund paths"],
  },
];

export function ArchitecturePanel() {
  return (
    <section className={`${styles.panel} ${styles.architecture}`} aria-labelledby="architecture-title">
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>Reference architecture</span>
          <h2 id="architecture-title">Three bounded trust zones</h2>
        </div>
        <span className={styles.statusDot}>Design only</span>
      </div>
      <p className={styles.featureLead}>
        The public UI, matcher, observers, and coordinator cannot spend user assets. Each layer receives only
        the authority it needs. Any implemented cross-layer message must be replay-protected and auditable.
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
      <div className={styles.honestyBar}>
        <strong>Target product boundary</strong>
        <span>Designed as a non-custodial exchange with an offchain matcher and wallet-signed native-ZEC atomic settlement. The matcher can censor or delay orders, so it is not trustless. Mainnet access policy remains unresolved.</span>
      </div>
    </section>
  );
}
