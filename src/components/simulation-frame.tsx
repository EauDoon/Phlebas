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
      <nav className={styles.skipNav} aria-label="Skip links">
        <a className={styles.skipLink} href="#main-content">Skip to main content</a>
      </nav>
      <div className={styles.simulationBanner} role="status">
        <strong>Simulation only</strong>
        <span>No-value simulation. Optional Sepolia wallet and local testnet services do not move mainnet funds.</span>
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
          <Link href="/legal">Legal</Link>
          <Link href="/security">Security</Link>
        </nav>
      </header>
      <main id="main-content" tabIndex={-1} className={styles.simpleMain}>
        <h1>{title}</h1>
        {children}
      </main>
      <footer className={styles.footer}>
        <span>Phlebas is a protocol preview, not a live exchange or an offer of financial services.</span>
        <nav aria-label="Footer">
          <Link href="/trade?view=architecture">Architecture</Link>
          <Link href="/legal">Legal and compliance</Link>
          <Link href="/#launch-gates">Launch gates</Link>
          <Link href="/security">Security</Link>
          <Link href="/status">Status</Link>
        </nav>
      </footer>
    </div>
  );
}
