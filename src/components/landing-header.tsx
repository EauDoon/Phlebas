"use client";

import Link from "next/link";
import { useRef, type MouseEvent } from "react";

import styles from "./landing.module.css";

const navigation = [
  { href: "#terminal-preview", label: "Markets" },
  { href: "#journeys", label: "Liquidity" },
  { href: "#pairs", label: "Native settlement" },
  { href: "/trade?view=architecture", label: "Architecture" },
  { href: "#launch-gates", label: "Launch gates" },
  { href: "/status", label: "Status" },
];

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
        {navigation.map((item) => <a href={item.href} key={item.href}>{item.label}</a>)}
      </nav>

      <div className={styles.headerActions}>
        <span className={styles.previewStatus}><i />No-value preview</span>
        <Link href="/trade?view=trade" className={styles.headerCta}>Enter simulation</Link>
        <button type="button" className={styles.menuButton} onClick={openMenu}>Menu</button>
      </div>

      <dialog ref={dialogRef} className={styles.menuDialog} aria-labelledby="menu-title">
        <div className={styles.menuDialogHeader}>
          <strong id="menu-title">Navigate Phlebas</strong>
          <button type="button" onClick={closeMenu} aria-label="Close menu">Close</button>
        </div>
        <nav aria-label="Mobile landing navigation">
          {navigation.map((item) => (
            <a href={item.href} key={item.href} onClick={(event) => followHash(event, item.href)}>{item.label}</a>
          ))}
          <Link href="/trade?view=trade" onClick={closeMenu}>Enter simulation</Link>
        </nav>
      </dialog>
    </header>
  );
}
