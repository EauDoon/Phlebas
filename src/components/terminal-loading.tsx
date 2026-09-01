"use client";

import { activateSkipLink } from "@/lib/skip-link";

import { PreviewChip } from "./preview-chip";
import { SiteChromeHeader } from "./site-chrome";
import { SiteFooter } from "./site-footer";
import styles from "./terminal.module.css";

export function TerminalLoading() {
  return (
    <div className={styles.shell}>
      <nav className={styles.skipNav} aria-label="Skip links">
        <a className={styles.skipLink} href="#main-content" onClick={activateSkipLink}>Skip to main content</a>
        <a className={styles.skipLink} href="#withheld-price" onClick={activateSkipLink}>Skip to withheld-price notice</a>
      </nav>
      <PreviewChip />
      <SiteChromeHeader />
      <main id="main-content" tabIndex={-1} className={styles.simpleMain}>
        <h1>Loading the terminal</h1>
        <p id="withheld-price" tabIndex={-1} aria-label="Withheld-price notice">
          No prices, balances, or depth are shown while this route loads.
          No market data is live.
          Nothing was submitted.
        </p>
      </main>
      <SiteFooter />
    </div>
  );
}
