import styles from "./terminal.module.css";

const steps = [
  {
    number: "01",
    title: "Receive a unique TEX address",
    body: "A production gateway would issue one transparent-only Zcash deposit intent. This simulation does not generate an address.",
  },
  {
    number: "02",
    title: "Observe and screen the deposit",
    body: "Independent Zebra observers would bind the transaction output, amount, destination, block height, and chain state to one mint authorization.",
  },
  {
    number: "03",
    title: "Wait for the risk-tier threshold",
    body: "Confirmations, minimum elapsed time, sanctions screening, and reserve caps must all pass. Zero-confirmation credit is never allowed.",
  },
  {
    number: "04",
    title: "Mint pZEC on Arbitrum",
    body: "The gateway would mint an 8-decimal custody receipt. One ZEC is intended to back one pZEC, subject to published liabilities and reserves.",
  },
];

export function BridgePanel() {
  return (
    <div className={styles.featureGrid}>
      <section className={`${styles.panel} ${styles.featurePrimary}`} aria-labelledby="bridge-title">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Transparent Zcash gateway</span>
            <h2 id="bridge-title">ZEC to pZEC</h2>
          </div>
          <span className={styles.warningPill}>Not operational</span>
        </div>
        <p className={styles.featureLead}>
          Native ZEC cannot live inside an EVM liquidity pool. Phlebas therefore specifies a
          fully reserved pZEC receipt for trading and LP settlement. That gateway introduces
          custody, operator, and regulatory risk.
        </p>
        <ol className={styles.stepList}>
          {steps.map((step) => (
            <li key={step.number}>
              <span>{step.number}</span>
              <div><h3>{step.title}</h3><p>{step.body}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <aside className={`${styles.panel} ${styles.riskCard}`} aria-labelledby="privacy-title">
        <span className={styles.eyebrow}>Privacy boundary</span>
        <h2 id="privacy-title">Transparent in, public onchain</h2>
        <p>
          Phlebas does not provide shielded deposits. A TEX address is a wallet-level safety
          mechanism, not proof that a coin has always remained transparent.
        </p>
        <div className={styles.callout}>
          <strong>Public linkability</strong>
          <span>Deposits, pZEC movements, orders, fills, LP positions, and withdrawals may be linkable.</span>
        </div>
        <div className={styles.callout}>
          <strong>Reserve rule</strong>
          <span>Confirmed controlled reserve plus separately reported, claim-matched principal in transit must cover every pZEC and pending customer claim. In-transit principal is not reusable reserve.</span>
        </div>
      </aside>
    </div>
  );
}
