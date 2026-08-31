"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import {
  LANDING_JOURNEYS,
  landingJourneyFromHash,
  landingJourneyHash,
  type LandingJourneyId,
} from "@/lib/landing-journeys";

import styles from "./landing.module.css";

export function LandingJourneys() {
  const [selected, setSelected] = useState<LandingJourneyId | null>(null);
  const tabRefs = useRef<Partial<Record<LandingJourneyId, HTMLButtonElement | null>>>({});
  const tabbed = selected !== null;
  const active = selected ?? "trader";

  useEffect(() => {
    function applyHash() {
      setSelected(landingJourneyFromHash(window.location.hash));
    }
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, []);

  function selectJourney(id: LandingJourneyId, focus = false) {
    setSelected(id);
    const nextHash = landingJourneyHash(id);
    if (window.location.hash !== nextHash) {
      window.history.replaceState(null, "", nextHash);
    }
    if (focus) {
      queueMicrotask(() => tabRefs.current[id]?.focus());
    }
  }

  function onTabListKey(event: KeyboardEvent<HTMLDivElement>) {
    const focusedId = LANDING_JOURNEYS.find((journey) => tabRefs.current[journey.id] === event.target)?.id ?? active;
    const index = LANDING_JOURNEYS.findIndex((journey) => journey.id === focusedId);
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % LANDING_JOURNEYS.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + LANDING_JOURNEYS.length) % LANDING_JOURNEYS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = LANDING_JOURNEYS.length - 1;
    else return;
    event.preventDefault();
    const journey = LANDING_JOURNEYS[next];
    if (!journey) return;
    tabRefs.current[journey.id]?.focus();
  }

  return (
    <section className={styles.journeySection} id="journeys" aria-labelledby="journeys-title">
      <div className={styles.sectionIntro}>
        <span className={styles.eyebrow}>Choose a path</span>
        <h2 id="journeys-title">Choose what to inspect.</h2>
      </div>
      <div>
        <div
          className={styles.journeyTabs}
          role="tablist"
          aria-label="Product journeys"
          hidden={!tabbed}
          onKeyDown={onTabListKey}
        >
          {LANDING_JOURNEYS.map((journey) => (
            <button
              type="button"
              key={journey.id}
              id={`journey-tab-${journey.id}`}
              role="tab"
              aria-selected={active === journey.id}
              aria-controls={`journey-${journey.id}`}
              tabIndex={active === journey.id ? 0 : -1}
              className={active === journey.id ? styles.journeyTabActive : undefined}
              ref={(node) => {
                tabRefs.current[journey.id] = node;
              }}
              onClick={() => selectJourney(journey.id)}
            >
              {journey.tab}
            </button>
          ))}
        </div>
        <div className={styles.journeyList}>
          {LANDING_JOURNEYS.map((journey) => (
            <article
              key={journey.id}
              id={`journey-${journey.id}`}
              role={tabbed ? "tabpanel" : undefined}
              aria-labelledby={tabbed ? `journey-tab-${journey.id}` : undefined}
              hidden={tabbed && active !== journey.id}
            >
              <span className={styles.journeyNumber}>{journey.tab}</span>
              <div>
                <span className={styles.eyebrow}>{journey.tab}</span>
                <h3>{journey.title}</h3>
              </div>
              <p>{journey.description}</p>
              <Link href={journey.href}>{journey.action} <span>↗</span></Link>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
