import Link from "next/link";

import { COUNTRY_BLOCKED_COPY } from "@/lib/access-demo";

import styles from "./terminal.module.css";

export function CountryBlock() {
  return (
    <section
      id="country-block"
      className={`${styles.panel} ${styles.blockedPanel}`}
      aria-labelledby="country-block-title"
      tabIndex={-1}
    >
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>{COUNTRY_BLOCKED_COPY.label}</span>
          <h2 id="country-block-title">{COUNTRY_BLOCKED_COPY.title}</h2>
        </div>
        <span className={styles.statusDot}>Public preview</span>
      </div>
      <p className={styles.featureLead}>{COUNTRY_BLOCKED_COPY.body}</p>
      <div className={styles.honestyBar}>
        <strong>Venue documents</strong>
        <span>
          This is a shareable preview of a blocked location. This page does not request location, identity, or account information.
        </span>
      </div>
      <nav className={styles.tourNav} aria-label="Blocked-location documents">
        <Link href="/trade?view=architecture">{COUNTRY_BLOCKED_COPY.architecture}</Link>
        <Link href="/">{COUNTRY_BLOCKED_COPY.home}</Link>
      </nav>
    </section>
  );
}
