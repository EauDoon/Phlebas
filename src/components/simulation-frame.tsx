"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Link from "next/link";

import { activateSkipLink } from "@/lib/skip-link";
import { nextSkipNavState, type SkipNavState } from "../lib/skip-nav-state.ts";
import styles from "./terminal.module.css";

export function SimulationFrame({
  title,
  children,
  skipTo,
}: {
  title: string;
  children: ReactNode;
  skipTo?: { href: string; label: string };
}) {
  const skipNavRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const nav = skipNavRef.current;
    if (!nav) return;
    let state: SkipNavState = "hidden";
    const setState = (next: SkipNavState) => {
      state = next;
      nav.setAttribute("data-skip-nav-state", next);
    };
    const onClick = () => setState(nextSkipNavState(state, { kind: "click" }));
    const onFocusIn = () => setState(nextSkipNavState(state, { kind: "focusin" }));
    const onKeydown = (event: KeyboardEvent) => {
      const next = nextSkipNavState(state, { kind: "keydown", key: event.key });
      if (next !== state) setState(next);
    };
    nav.addEventListener("click", onClick);
    nav.addEventListener("focusin", onFocusIn);
    nav.addEventListener("keydown", onKeydown);
    return () => {
      nav.removeEventListener("click", onClick);
      nav.removeEventListener("focusin", onFocusIn);
      nav.removeEventListener("keydown", onKeydown);
    };
  }, []);

  return (
    <div className={styles.shell}>
      <nav ref={skipNavRef} className={styles.skipNav} aria-label="Skip links" data-skip-nav-state="hidden">
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
