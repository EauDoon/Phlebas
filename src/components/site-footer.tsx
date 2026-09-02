import Link from "next/link";

import { BrandMark } from "./brand-mark";
import styles from "./site-footer.module.css";

export const SITE_FOOTER_SENTENCE =
  "Phlebas is pre-launch. It is not yet a live exchange and is not an offer of financial services.";

const FOOTER_LINKS = [
  { href: "/trade?view=architecture", label: "Docs" },
  { href: "/legal", label: "Legal" },
  { href: "/security", label: "Security" },
  { href: "/status", label: "Status" },
  { href: "/#launch-gates", label: "Launch gates" },
] as const;

export function SiteFooter() {
  return (
    <footer className={styles.footer}>
      <div className={styles.brand}>
        <BrandMark className={styles.brandMark} />
        <span>PHLEBAS</span>
      </div>
      <p>{SITE_FOOTER_SENTENCE}</p>
      <nav aria-label="Footer">
        {FOOTER_LINKS.map((item) => (
          <Link href={item.href} key={item.href}>{item.label}</Link>
        ))}
      </nav>
    </footer>
  );
}
