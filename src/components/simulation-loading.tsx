import styles from "./terminal.module.css";

export function SimulationLoading() {
  return (
    <div className={styles.shell}>
      <div className={styles.simulationBanner} role="status">
        <strong>Simulation only</strong>
        <span>Loading the preview. No market data is live.</span>
      </div>
      <main id="main-content" tabIndex={-1} className={styles.simpleMain}>
        <h1>Loading the simulation</h1>
        <p id="withheld-price" tabIndex={-1}>
          No prices, balances, or depth are shown while this route loads.
          Nothing was submitted.
        </p>
      </main>
    </div>
  );
}
