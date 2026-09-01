"use client";

import Link from "next/link";

import { activateSkipLink } from "@/lib/skip-link";

import {
  LANDING_HERO,
  LANDING_LEDGER,
  LANDING_LEDGER_HEADING,
  LANDING_LEDGER_NOTE,
  LANDING_LEDGER_PILL,
  LANDING_MARKETS,
  LANDING_MARKETS_INTRO,
  LANDING_PATHS_INTRO,
  LANDING_SETTLEMENT_INTRO,
  LANDING_SETTLEMENT_STEPS,
  LANDING_SKIP_LINKS,
  LANDING_STATUS_DETAILS,
  LANDING_WHY_NOT_WRAPPED_INTRO,
} from "@/lib/landing-copy";
import { LANDING_EVIDENCE } from "@/lib/landing-evidence";
import {
  LANDING_GATES_ACTION,
  LANDING_GATES_HREF,
  LANDING_GATES_INTRO,
  LANDING_GATES_SUMMARY,
} from "@/lib/landing-gates";

import { LandingHeader } from "./landing-header";
import { LandingJourneys } from "./landing-journeys";
import { LandingTerminalPreview } from "./landing-terminal-preview";
import { PreviewChip } from "./preview-chip";
import { SiteFooter } from "./site-footer";
import styles from "./landing.module.css";

export function LandingPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.skipNav} aria-label="Skip links">
        {LANDING_SKIP_LINKS.map((link) => (
          <a className={styles.skipLink} href={link.href} key={link.href} onClick={activateSkipLink}>{link.label}</a>
        ))}
      </nav>
      <PreviewChip />
      <LandingHeader />

      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroStatement}>
            <span className={styles.eyebrow}>{LANDING_HERO.eyebrow}</span>
            <h1 id="hero-title">{LANDING_HERO.heading}</h1>
            <p>{LANDING_HERO.supporting}</p>
          </div>

          <div className={styles.systemLedger} aria-labelledby="system-ledger-title">
            <div className={styles.ledgerHeader}>
              <h2 id="system-ledger-title">{LANDING_LEDGER_HEADING}</h2>
              <span className={styles.designPill}>{LANDING_LEDGER_PILL}</span>
            </div>
            <dl role="list" aria-label={LANDING_LEDGER_HEADING}>
              {LANDING_LEDGER.map((row) => (
                <div key={row.label} role="listitem">
                  <dt>{row.label}</dt>
                  <dd>{row.value}</dd>
                </div>
              ))}
            </dl>
            <p>{LANDING_LEDGER_NOTE}</p>
            <Link href="/status" className={styles.secondaryCta}>{LANDING_STATUS_DETAILS}</Link>
          </div>

          <div className={styles.heroActions}>
            <Link href={LANDING_HERO.primaryHref} className={styles.primaryCta}>{LANDING_HERO.primaryAction} <span>↗</span></Link>
            <Link href={LANDING_HERO.secondaryHref} className={styles.secondaryCta}>{LANDING_HERO.secondaryAction}</Link>
            <p>{LANDING_HERO.disclosure}</p>
          </div>
        </section>

        <section className={styles.marketSection} id="markets" tabIndex={-1} aria-labelledby="markets-title">
          <div className={styles.sectionIntro}>
            <span className={styles.eyebrow}>{LANDING_MARKETS_INTRO.eyebrow}</span>
            <h2 id="markets-title">{LANDING_MARKETS_INTRO.heading}</h2>
            <p>{LANDING_MARKETS_INTRO.supporting}</p>
          </div>
          <div className={styles.marketCards} role="list" aria-label={LANDING_MARKETS_INTRO.eyebrow}>
            {LANDING_MARKETS.map((market, index) => (
              <article key={market.title} role="listitem">
                <span className={styles.marketIndex}>{String(index + 1).padStart(2, "0")}</span>
                <span className={styles.eyebrow}>{market.kicker}</span>
                <h3>{market.title}</h3>
                <p>{market.body}</p>
                <Link href={market.href}>{market.action} <span>→</span></Link>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.pairsSection} id="settlement-how" tabIndex={-1} aria-labelledby="settlement-how-title">
          <div className={`${styles.pairsCopy} ${styles.sectionIntro}`}>
            <span className={styles.eyebrow}>{LANDING_SETTLEMENT_INTRO.eyebrow}</span>
            <h2 id="settlement-how-title">{LANDING_SETTLEMENT_INTRO.heading}</h2>
            <p>{LANDING_SETTLEMENT_INTRO.supporting}</p>
          </div>
          <ol className={styles.assetFlow} aria-label={LANDING_SETTLEMENT_INTRO.eyebrow}>
            {LANDING_SETTLEMENT_STEPS.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{step.title}</strong>
                <small>{step.detail}</small>
              </li>
            ))}
          </ol>
        </section>

        <section className={styles.evidenceSection} id="why-not-wrapped" tabIndex={-1} aria-labelledby="why-not-wrapped-title">
          <div className={styles.sectionIntro}>
            <span className={styles.eyebrow}>{LANDING_WHY_NOT_WRAPPED_INTRO.eyebrow}</span>
            <h2 id="why-not-wrapped-title">{LANDING_WHY_NOT_WRAPPED_INTRO.heading}</h2>
            <p>{LANDING_WHY_NOT_WRAPPED_INTRO.supporting}</p>
          </div>
          <div className={styles.evidenceList} role="list" aria-label={LANDING_WHY_NOT_WRAPPED_INTRO.eyebrow}>
            {LANDING_EVIDENCE.map((row, index) => (
              <article key={row.title} role="listitem">
                <span className={styles.journeyNumber}>{String(index + 1).padStart(2, "0")}</span>
                <h3>{row.title}</h3>
                <p>{row.body}</p>
              </article>
            ))}
          </div>
        </section>

        <LandingTerminalPreview />

        <section className={styles.journeySection} id="paths" tabIndex={-1} aria-labelledby="paths-title">
          <div className={styles.sectionIntro}>
            <span className={styles.eyebrow}>{LANDING_PATHS_INTRO.eyebrow}</span>
            <h2 id="paths-title">{LANDING_PATHS_INTRO.heading}</h2>
          </div>
          <LandingJourneys />
        </section>

        <section className={styles.gatesSection} id="launch-gates" tabIndex={-1} aria-labelledby="gates-title">
          <div className={styles.sectionIntro}>
            <span className={styles.eyebrow}>{LANDING_GATES_INTRO.eyebrow}</span>
            <h2 id="gates-title">{LANDING_GATES_INTRO.heading}</h2>
          </div>
          <div className={styles.gateCopy}>
            <p>{LANDING_GATES_SUMMARY}</p>
            <Link href={LANDING_GATES_HREF}>{LANDING_GATES_ACTION} <span>→</span></Link>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}
