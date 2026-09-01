"use client";

import Link from "next/link";
import { useRef, type MouseEvent } from "react";

import styles from "./landing.module.css";

const navigation = [
  { href: "#markets", label: "Markets" },
  { href: "/trade?view=trade", label: "Terminal" },
  { href: "/liquidity", label: "Liquidity" },
  { href: "/trade?view=architecture", label: "Docs" },
  { href: "/status", label: "Status" },
] as const;

export function LandingHeader() {
  const dialogRef = useRef<HTMLDialogElement>(null);

  function openMenu() {
    dialogRef.current?.showModal();
  }

  function closeMenu() {
    dialogRef.current?.close();
  }

  function followHash(event: MouseEvent<HTMLAnchorElement>, href: string) {
    if (!href.startsWith("#")) {
      closeMenu();
      return;
    }
    event.preventDefault();
    closeMenu();
    const target = document.getElementById(href.slice(1));
    target?.scrollIntoView();
    window.history.replaceState(null, "", href);
  }

  return (
    <header className={styles.header}>
      <Link href="/" className={styles.brand} aria-label="Phlebas home">
        <span className={styles.brandMark}>P</span>
        <span>PHLEBAS</span>
      </Link>

      <nav className={styles.desktopNav} aria-label="Landing navigation">
        {navigation.map((item) => (
          item.href.startsWith("#")
            ? <a href={item.href} key={item.href}>{item.label}</a>
            : <Link href={item.href} key={item.href}>{item.label}</Link>
        ))}
      </nav>

      <div className={styles.headerActions}>
        <Link href="/trade?view=settlement" className={styles.headerSecondary}>How settlement works</Link>
        <Link href="/trade?view=trade" className={styles.headerCta}>Open terminal</Link>
        <button type="button" className={styles.menuButton} onClick={openMenu}>Menu</button>
      </div>

      <dialog ref={dialogRef} className={styles.menuDialog} aria-labelledby="menu-title">
        <div className={styles.menuDialogHeader}>
          <strong id="menu-title">Navigate Phlebas</strong>
          <button type="button" onClick={closeMenu} aria-label="Close menu">Close</button>
        </div>
        <nav aria-label="Mobile landing navigation">
          {navigation.map((item) => (
            item.href.startsWith("#")
              ? (
                <a href={item.href} key={item.href} onClick={(event) => followHash(event, item.href)}>
                  {item.label}
                </a>
              )
              : (
                <Link href={item.href} key={item.href} onClick={closeMenu}>
                  {item.label}
                </Link>
              )
          ))}
          <Link href="/trade?view=settlement" onClick={closeMenu}>How settlement works</Link>
          <Link href="/trade?view=trade" onClick={closeMenu}>Open terminal</Link>
        </nav>
      </dialog>
    </header>
  );
}
