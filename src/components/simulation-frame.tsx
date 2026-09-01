"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";

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

export function SimulationFrame({
  title,
  children,
  skipTo,
}: {
  title: string;
  children: ReactNode;
  skipTo?: { href: string; label: string };
}) {
  return (
    <div className={styles.shell}>
      <nav className={styles.skipNav} aria-label="Skip links">
        <a className={styles.skipLink} href="#main-content" onClick={activateSkipLink}>Skip to main content</a>
        {skipTo ? <a className={styles.skipLink} href={skipTo.href} onClick={activateSkipLink}>{skipTo.label}</a> : null}
      </nav>
      <div className={styles.simulationBanner} role="status" aria-label="Simulation disclosure">
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
