"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import { activateSkipLink } from "@/lib/skip-link";

import { PreviewChip } from "./preview-chip";
import { SiteFooter } from "./site-footer";
import styles from "./terminal.module.css";

const navigation = [
  { href: "/#markets", label: "Markets" },
  { href: "/trade?view=trade", label: "Terminal" },
  { href: "/liquidity", label: "Liquidity" },
  { href: "/trade?view=architecture", label: "Docs" },
  { href: "/status", label: "Status" },
] as const;

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
      <PreviewChip />
      <header className={styles.topbar}>
        <Link href="/" className={styles.brand} aria-label="Phlebas home">
          <span className={styles.brandMark}>P</span>
          <span>PHLEBAS</span>
        </Link>
        <nav className={styles.nav} aria-label="Primary navigation">
          {navigation.map((item) => (
            <Link href={item.href} key={item.href}>{item.label}</Link>
          ))}
        </nav>
        <div className={styles.headerActions}>
          <Link href="/trade?view=trade" className={styles.headerCta}>Open terminal</Link>
        </div>
      </header>
      <main id="main-content" tabIndex={-1} className={styles.simpleMain}>
        <h1>{title}</h1>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
