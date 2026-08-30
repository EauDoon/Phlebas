"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import styles from "./terminal.module.css";

export function SimulationFrame({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      <div className={styles.simulationBanner} role="status">
        <strong>Simulation only</strong>
        <span>No wallets, real assets, live prices, contracts, deposits, or custody keys are connected.</span>
      </div>
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="Phlebas home">
          <span className={styles.brandMark}>P</span>
          <span>PHLEBAS</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          <Link href="/trade?view=trade">Trade</Link>
          <Link href="/liquidity">Liquidity</Link>
          <Link href="/status">Status</Link>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className={styles.simpleMain}>
        <h1>{title}</h1>
        {children}
      </main>
    </div>
  );
}
