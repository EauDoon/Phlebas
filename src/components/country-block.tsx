import Link from "next/link";

import { COUNTRY_BLOCKED_COPY } from "@/lib/access-demo";

import styles from "./terminal.module.css";

export function CountryBlock() {
  return (
    <section className={`${styles.panel} ${styles.blockedPanel}`} aria-labelledby="country-block-title">
      <div className={styles.panelHeader}>
        <div>
          <span className={styles.eyebrow}>{COUNTRY_BLOCKED_COPY.label}</span>
          <h2 id="country-block-title">{COUNTRY_BLOCKED_COPY.title}</h2>
        </div>
      </div>
      <p className={styles.featureLead}>{COUNTRY_BLOCKED_COPY.body}</p>
      <p className={styles.inlineNotice}>
        This is a shareable preview of a blocked location. The simulation does not request location, identity, or account information.
      </p>
      <div className={styles.tourNav}>
        <Link href="/trade?view=architecture">{COUNTRY_BLOCKED_COPY.architecture}</Link>
        <Link href="/">{COUNTRY_BLOCKED_COPY.home}</Link>
      </div>
    </section>
  );
}
