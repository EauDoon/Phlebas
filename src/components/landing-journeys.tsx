"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type KeyboardEvent } from "react";

import {
  LANDING_JOURNEY_IDS,
  LANDING_JOURNEYS,
  type LandingJourneyId,
  nextLandingJourneyId,
} from "@/lib/landing-journeys";
import { LANDING_PATHS_INTRO } from "@/lib/landing-copy";

import styles from "./landing.module.css";

function subscribe() {
  return () => undefined;
}

function journeyIndexLabel(index: number) {
  return String(index + 1).padStart(2, "0");
}

function JourneyArticle({
  journey,
}: {
  journey: (typeof LANDING_JOURNEYS)[number];
}) {
  return (
    <article role="listitem">
      <span className={styles.journeyNumber}>{journeyIndexLabel(LANDING_JOURNEYS.indexOf(journey))}</span>
      <div>
        <span className={styles.eyebrow}>{journey.tab}</span>
        <h3>{journey.title}</h3>
      </div>
      <p>{journey.description}</p>
      <Link href={journey.href}>{journey.action} <span>↗</span></Link>
    </article>
  );
}

export function LandingJourneys() {
  const tablistId = useId();
  const tabRefs = useRef<Partial<Record<LandingJourneyId, HTMLButtonElement | null>>>({});
  const hydrated = useSyncExternalStore(subscribe, () => true, () => false);
  const [selected, setSelected] = useState<LandingJourneyId>("trader");
  const [focusId, setFocusId] = useState<LandingJourneyId>("trader");
  const lastId = LANDING_JOURNEY_IDS[LANDING_JOURNEY_IDS.length - 1];

  useEffect(() => {
    function onClick(event: MouseEvent) {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (target.closest("a[href='#paths']") || target.closest("a[href='#journeys']")) {
        setSelected("quotes");
        setFocusId("quotes");
      }
    }
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  function moveFocus(next: LandingJourneyId) {
    setFocusId(next);
    tabRefs.current[next]?.focus();
  }

  function onTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: LandingJourneyId) {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      moveFocus(nextLandingJourneyId(id, 1));
      return;
    }
    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      moveFocus(nextLandingJourneyId(id, -1));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      moveFocus(LANDING_JOURNEY_IDS[0]);
      return;
    }
    if (event.key === "End") {
      event.preventDefault();
      moveFocus(lastId);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setSelected(id);
      setFocusId(id);
    }
  }

  if (!hydrated) {
    return (
      <div className={styles.journeyList} role="list" aria-label={LANDING_PATHS_INTRO.eyebrow}>
        {LANDING_JOURNEYS.map((journey) => (
          <JourneyArticle key={journey.id} journey={journey} />
        ))}
      </div>
    );
  }

  return (
    <div className={`${styles.journeyChooser} ${styles.terminalPreviewFrame}`}>
      <div className={styles.terminalPreviewHeader}>
        <div
          className={styles.journeyTabs}
          role="tablist"
          aria-label={LANDING_PATHS_INTRO.eyebrow}
          aria-orientation="horizontal"
        >
          {LANDING_JOURNEYS.map((journey, index) => (
            <button
              type="button"
              key={journey.id}
              role="tab"
              id={`${tablistId}-${journey.id}`}
              aria-controls={`${tablistId}-panel-${journey.id}`}
              aria-selected={selected === journey.id}
              tabIndex={focusId === journey.id ? 0 : -1}
              ref={(node) => {
                tabRefs.current[journey.id] = node;
              }}
              onClick={() => {
                setSelected(journey.id);
                setFocusId(journey.id);
              }}
              onKeyDown={(event) => onTabKeyDown(event, journey.id)}
            >
              <span className={styles.journeyNumber} aria-hidden="true">
                {journeyIndexLabel(index)}{" "}
              </span>
              {journey.tab}
            </button>
          ))}
        </div>
      </div>
      {LANDING_JOURNEYS.map((journey, index) => (
        <div
          key={journey.id}
          className={styles.journeyPanel}
          role="tabpanel"
          id={`${tablistId}-panel-${journey.id}`}
          aria-labelledby={`${tablistId}-${journey.id}`}
          hidden={selected !== journey.id}
        >
          <div className={styles.terminalPreviewTicket}>
            <div>
              <span className={styles.journeyNumber}>{journeyIndexLabel(index)} </span>
              <span className={styles.eyebrow}>{journey.tab}</span>
            </div>
            <h3>{journey.title}</h3>
            <p>{journey.description}</p>
            <Link href={journey.href} className={styles.primaryCta}>
              {journey.action} <span>↗</span>
            </Link>
          </div>
        </div>
      ))}
    </div>
  );
}
