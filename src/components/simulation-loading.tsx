"use client";

import { type MouseEvent } from "react";

import styles from "./terminal.module.css";

function activateSkipLink(event: MouseEvent<HTMLAnchorElement>) {
  const href = event.currentTarget.getAttribute("href");
  if (!href?.startsWith("#")) return;
  const target = document.getElementById(href.slice(1));
  if (!(target instanceof HTMLElement)) return;
  event.preventDefault();
  event.currentTarget.blur();
  target.focus();
  window.history.replaceState(null, "", href);
}

export function SimulationLoading() {
  return (
    <div className={styles.shell}>
      <nav className={styles.skipNav} aria-label="Skip links">
        <a className={styles.skipLink} href="#main-content" onClick={activateSkipLink}>Skip to main content</a>
        <a className={styles.skipLink} href="#withheld-price" onClick={activateSkipLink}>Skip to withheld-price notice</a>
      </nav>
      <div className={styles.simulationBanner} role="status" aria-label="Simulation disclosure">
        <strong>Simulation only</strong>
        <span>Loading the preview. No market data is live.</span>
      </div>
      <main id="main-content" tabIndex={-1} className={styles.simpleMain}>
        <h1>Loading the simulation</h1>
        <p id="withheld-price" tabIndex={-1} aria-label="Withheld-price notice">
          No prices, balances, or depth are shown while this route loads.
          Nothing was submitted.
        </p>
      </main>
    </div>
  );
}
