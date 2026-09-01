"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { PRODUCT_NAV } from "@/lib/landing-copy";
import { activateSkipLink } from "@/lib/skip-link";

import { PreviewChip } from "./preview-chip";
import { SiteFooter } from "./site-footer";
import styles from "./terminal.module.css";

function isProductNavCurrent(label: string, pathname: string): boolean {
  return (
    (label === "Terminal" && pathname === "/trade")
    || (label === "Liquidity" && pathname === "/liquidity")
    || (label === "Status" && pathname === "/status")
  );
}

export function SiteChromeHeader() {
  const pathname = usePathname();

  return (
    <header className={styles.topbar}>
      <Link href="/" className={styles.brand} aria-label="Phlebas home">
        <span className={styles.brandMark} aria-hidden="true">P</span>
        <span>PHLEBAS</span>
      </Link>
      <nav className={styles.nav} aria-label="Primary navigation">
        {PRODUCT_NAV.map((item) => {
          const current = isProductNavCurrent(item.label, pathname);
          return (
            <Link
              href={item.href}
              key={item.href}
              className={current ? styles.navActive : undefined}
              aria-current={current ? "page" : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className={styles.headerActions}>
        <Link href="/trade?view=trade" className={styles.headerCta}>Open terminal</Link>
      </div>
    </header>
  );
}

export function SiteChrome({
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
      <SiteChromeHeader />
      <main id="main-content" tabIndex={-1} className={styles.simpleMain}>
        <h1>{title}</h1>
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
