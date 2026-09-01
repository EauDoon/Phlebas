"use client";

import Link from "next/link";

import { activateSkipLink } from "@/lib/skip-link";

import {
  LANDING_HERO,
  LANDING_LEDGER,
  LANDING_LEDGER_HEADING,
  LANDING_PZEC,
  LANDING_SKIP_LINKS,
} from "@/lib/landing-copy";
import { LANDING_EVIDENCE } from "@/lib/landing-evidence";
import { LANDING_GATE_STATUS, LANDING_MAINNET_GATES } from "@/lib/landing-gates";

import { LandingHeader } from "./landing-header";
import { LandingJourneys } from "./landing-journeys";
import { LandingTerminalPreview } from "./landing-terminal-preview";
import styles from "./landing.module.css";

export function LandingPage() {
  return (
    <div className={styles.page}>
      <nav className={styles.skipNav} aria-label="Skip links">
        {LANDING_SKIP_LINKS.map((link) => (
          <a className={styles.skipLink} href={link.href} key={link.href} onClick={activateSkipLink}>{link.label}</a>
        ))}
      </nav>
      <div className={styles.simulationBanner} role="status" aria-label="Simulation disclosure">
        <strong>Simulation only</strong>
        <span>No-value simulation. Optional Sepolia wallet and local testnet services stay off until started. No mainnet funds.</span>
      </div>
      <LandingHeader />

      <main id="main-content" tabIndex={-1}>
        <section className={styles.hero} aria-labelledby="hero-title">
          <div className={styles.heroStatement}>
            <span className={styles.eyebrow}>{LANDING_HERO.eyebrow}</span>
            <h1 id="hero-title">{LANDING_HERO.heading}</h1>
            <p>{LANDING_HERO.supporting}</p>
          </div>

          <aside className={styles.systemLedger} aria-labelledby="system-ledger-title">
            <div className={styles.ledgerHeader}>
              <div><h2 id="system-ledger-title">{LANDING_LEDGER_HEADING}</h2></div>
              <span className={styles.designPill}>Design only</span>
            </div>
            <dl role="list" aria-label="Current system">
              {LANDING_LEDGER.map((row) => (
                <div key={row.label} role="listitem"><dt>{row.label}</dt><dd>{row.value}</dd></div>
              ))}
            </dl>
            <p>Every displayed price, order, trade, pool reserve, and volume is synthetic.</p>
            <Link href="/status" className={styles.secondaryCta}>Open status details</Link>
          </aside>

          <div className={styles.heroActions}>
            <Link href="/trade?view=trade" className={styles.primaryCta}>{LANDING_HERO.primaryAction} <span>↗</span></Link>
            <a href="#pzec" className={styles.secondaryCta}>{LANDING_HERO.secondaryAction}</a>
            <p>{LANDING_HERO.disclosure}</p>
          </div>
        </section>

        <section className={styles.marketSection} id="markets" tabIndex={-1} aria-labelledby="markets-title">
          <div className={styles.sectionIntro}>
            <span className={styles.eyebrow}>Two focused markets</span>
            <h2 id="markets-title">Familiar labels.<br />Exact settlement.</h2>
            <p>Phlebas keeps the requested market names while disclosing the receipt and quote token used by the proposed Arbitrum settlement layer.</p>
          </div>
          <div className={styles.marketCards} role="list" aria-label="Focused markets">
            <article role="listitem">
              <span className={styles.marketIndex}>01</span>
              <div><span>Primary design</span><h3>ZEC / USDC</h3><p>Settles pZEC / USDC</p></div>
              <Link href={{ pathname: "/trade", query: { view: "trade", market: "ZEC/USDC" } }}>Preview market <span>→</span></Link>
            </article>
            <article role="listitem">
              <span className={styles.marketIndex}>02</span>
              <div><span>Later listing gate</span><h3>ZEC / USDT</h3><p>Settles pZEC / USDT0</p></div>
              <Link href={{ pathname: "/trade", query: { view: "trade", market: "ZEC/USDT" } }}>Preview market <span>→</span></Link>
            </article>
          </div>
        </section>

        <section className={styles.evidenceSection} id="exists-today" tabIndex={-1} aria-labelledby="exists-title">
          <div className={styles.sectionIntro}>
            <span className={styles.eyebrow}>What exists today</span>
            <h2 id="exists-title">A working preview, bounded on purpose.</h2>
          </div>
          <div className={styles.evidenceList} role="list" aria-label="What exists today">
            {LANDING_EVIDENCE.map((row, index) => (
              <article key={row.title} role="listitem">
                <span className={styles.journeyNumber}>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{row.title}</h3>
                  <p>{row.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className={styles.pzecSection} id="pzec" tabIndex={-1} aria-labelledby="pzec-title">
          <div className={styles.pzecCopy}>
            <span className={styles.eyebrow}>{LANDING_PZEC.eyebrow}</span>
            <h2 id="pzec-title">{LANDING_PZEC.heading}</h2>
            <p>{LANDING_PZEC.body}</p>
            <strong>{LANDING_PZEC.negation}</strong>
            <p>
              Native settlement target: each fill would use one transparent Zcash conditional lock and one exact-token EVM conditional lock. The pZEC pool and gateway screens remain a superseded pZEC pool fixture, not the native-settlement target.
            </p>
            <p>
              {LANDING_PZEC.disclosure}
              {" "}
              <a href={LANDING_PZEC.sourceHref}>{LANDING_PZEC.sourceLabel}</a>.
            </p>
          </div>
          <ol className={styles.assetFlow} aria-label="Proposed ZEC to market flow">
            {LANDING_PZEC.flow.map((step, index) => (
              <li key={step.title}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div><strong>{step.title}</strong><small>{step.detail}</small></div>
              </li>
            ))}
          </ol>
        </section>

        <LandingTerminalPreview />

        <section className={styles.journeySection} id="journeys" tabIndex={-1} aria-labelledby="journeys-title">
          <div className={styles.sectionIntro}>
            <span className={styles.eyebrow}>Choose a path</span>
            <h2 id="journeys-title">Choose what to inspect.</h2>
          </div>
          <LandingJourneys />
        </section>

        <section className={styles.gatesSection} id="launch-gates" tabIndex={-1} aria-labelledby="gates-title">
          <div>
            <span className={styles.eyebrow}>Not cleared for real assets</span>
            <h2 id="gates-title">Mainnet starts after evidence, not before it.</h2>
          </div>
          <div className={styles.gateCopy}>
            <p>Real assets stay blocked until entity, licensing, custody, reserve, signer, audit, market-integrity, jurisdiction, insurance, monitoring, and incident gates have current written evidence.</p>
            <ul aria-label="Mainnet launch gates">
              {LANDING_MAINNET_GATES.map((gate) => (
                <li key={gate}>
                  <span>{gate}</span>
                  <strong>{LANDING_GATE_STATUS}</strong>
                </li>
              ))}
            </ul>
            <Link href="/trade?view=architecture">Read the launch gates <span>→</span></Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.brand}><span className={styles.brandMark}>P</span><span>PHLEBAS</span></div>
        <p>Phlebas is a protocol preview, not a live exchange or an offer of financial services.</p>
        <nav aria-label="Footer">
          <Link href="/trade?view=architecture">Architecture</Link>
          <Link href="/legal">Legal and compliance</Link>
          <a href="#launch-gates">Launch gates</a>
          <Link href="/security">Security</Link>
          <Link href="/status">Status</Link>
        </nav>
      </footer>
    </div>
  );
}
