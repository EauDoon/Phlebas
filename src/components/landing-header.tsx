"use client";

import Link from "next/link";
import { useRef, type MouseEvent } from "react";

import { LANDING_HERO, LANDING_NAV } from "@/lib/landing-copy";

import styles from "./landing.module.css";

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
        <span className={styles.brandMark} aria-hidden="true">P</span>
        <span>PHLEBAS</span>
      </Link>

      <nav className={styles.desktopNav} aria-label="Landing navigation">
        {LANDING_NAV.map((item) => (
          item.href.startsWith("#")
            ? <a href={item.href} key={item.href}>{item.label}</a>
            : <Link href={item.href} key={item.href}>{item.label}</Link>
        ))}
      </nav>

      <div className={styles.headerActions}>
        <Link href={LANDING_HERO.secondaryHref} className={styles.headerSecondary}>{LANDING_HERO.secondaryAction}</Link>
        <Link href={LANDING_HERO.primaryHref} className={styles.headerCta}>{LANDING_HERO.primaryAction}</Link>
        <button
          type="button"
          className={styles.menuButton}
          aria-haspopup="dialog"
          aria-controls="landing-menu"
          onClick={openMenu}
        >
          Menu
        </button>
      </div>

      <dialog ref={dialogRef} id="landing-menu" className={styles.menuDialog} aria-labelledby="menu-title">
        <div className={styles.menuDialogHeader}>
          <strong id="menu-title">Navigate Phlebas</strong>
          <button type="button" onClick={closeMenu} aria-label="Close menu">Close</button>
        </div>
        <nav aria-label="Mobile landing navigation">
          {LANDING_NAV.map((item) => (
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
          <Link href={LANDING_HERO.secondaryHref} onClick={closeMenu}>{LANDING_HERO.secondaryAction}</Link>
          <Link href={LANDING_HERO.primaryHref} onClick={closeMenu}>{LANDING_HERO.primaryAction}</Link>
        </nav>
      </dialog>
    </header>
  );
}
