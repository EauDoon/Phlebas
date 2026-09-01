"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { DEPOSIT_TOUR, depositTourStep } from "@/lib/deposit-tour";
import {
  GATEWAY_JOURNEY_LABELS,
  GATEWAY_JOURNEYS,
  nextGatewayJourney,
  type GatewayJourney,
} from "@/lib/gateway-journeys";
import { inspectTransparentDestination } from "@/lib/zcash-address";
import { payoutClaimForTourStep, payoutClaimStubCopy, screenPayout } from "@/lib/payout";
import { interpretRovingKey } from "@/lib/roving-keys";
import { WITHDRAWAL_TOUR, withdrawalTourStep } from "@/lib/withdrawal-tour";
import { syntheticDepositRequest } from "@/lib/zip321";

import { PlaceholderQr } from "./placeholder-qr";
import styles from "./terminal.module.css";

// Not payable. The literal placeholder has no receiver and no wallet handoff.
export function BridgePanel({ initialJourney = "deposit" }: { initialJourney?: GatewayJourney }) {
  const [journey, setJourney] = useState<GatewayJourney>(initialJourney);
  const [journeyFocus, setJourneyFocus] = useState<GatewayJourney>("deposit");
  const journeyRefs = useRef<Partial<Record<GatewayJourney, HTMLButtonElement | null>>>({});
  const [depositIndex, setDepositIndex] = useState(0);
  const [tourIndex, setTourIndex] = useState(0);
  const [destination, setDestination] = useState("");
  const tour = withdrawalTourStep(tourIndex);
  const deposit = depositTourStep(depositIndex);
  const destinationCheck = inspectTransparentDestination(destination);
  const payoutPreview = destination.trim().length === 0
    ? null
    : screenPayout(destination, 1n);
  const tourClaim = payoutClaimForTourStep(tour.id, destination);
  const request = syntheticDepositRequest();

  function moveJourneyFocus(next: GatewayJourney) {
    setJourneyFocus(next);
    journeyRefs.current[next]?.focus();
  }

  function selectJourney(id: GatewayJourney) {
    setJourney(id);
    setJourneyFocus(id);
  }

  function onJourneyKeyDown(event: KeyboardEvent<HTMLButtonElement>, id: GatewayJourney) {
    const action = interpretRovingKey(event.key);
    if (!action) {
      return;
    }
    event.preventDefault();
    if (action === "next") {
      moveJourneyFocus(nextGatewayJourney(id, 1));
      return;
    }
    if (action === "prev") {
      moveJourneyFocus(nextGatewayJourney(id, -1));
      return;
    }
    if (action === "home") {
      moveJourneyFocus("deposit");
      return;
    }
    if (action === "end") {
      moveJourneyFocus("withdrawal");
      return;
    }
    selectJourney(id);
  }

  return (
    <div className={styles.featureGrid}>
      <section className={`${styles.panel} ${styles.featurePrimary}`} aria-labelledby="bridge-title">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Historical models</span>
            <h2 id="bridge-title">Historical ZEC state tour</h2>
          </div>
          <span className={styles.warningPill}>Retired</span>
        </div>
        <p className={styles.featureLead}>
          Native ZEC cannot live inside an EVM liquidity pool. This keyless state tour preserves
          the historical custody model without generating addresses, receiving assets, or handing
          off to a wallet. The native-settlement target uses wallet-controlled conditional locks.
        </p>

        <div className={styles.poolTabs} role="group" aria-label="Historical state journey">
          {GATEWAY_JOURNEYS.map((id) => (
            <button
              type="button"
              key={id}
              className={journey === id ? styles.poolActive : undefined}
              aria-pressed={journey === id}
              tabIndex={journeyFocus === id ? 0 : -1}
              ref={(node) => {
                journeyRefs.current[id] = node;
              }}
              onClick={() => selectJourney(id)}
              onKeyDown={(event) => onJourneyKeyDown(event, id)}
            >
              {GATEWAY_JOURNEY_LABELS[id]}
            </button>
          ))}
        </div>

        {journey === "deposit" ? (
          <>
            {deposit.id !== "address-request" && (
            <div className={styles.uriBlock}>
              <span className={styles.eyebrow}>Non-payable ZIP 321 format example</span>
              <code>{request}</code>
              <PlaceholderQr payload={request} />
              <small>
                The brace-delimited value is a literal placeholder, not a TEX address. No address
                is generated, copied, or accepted by this application.
              </small>
            </div>
            )}
            <p className={styles.gateNotice}>
              Historical deposit states only. This application never shows a receivable address.
            </p>
            <div className={styles.uriBlock} aria-live="polite">
              <span className={styles.eyebrow}>{String(depositIndex + 1).padStart(2, "0")} / {String(DEPOSIT_TOUR.length).padStart(2, "0")}</span>
              <h3>{deposit.title}</h3>
              <p>{deposit.body}</p>
            </div>
            <div className={styles.tourNav}>
              <button
                type="button"
                disabled={depositIndex === 0}
                onClick={() => setDepositIndex((index) => index - 1)}
              >
                Previous state
              </button>
              <button
                type="button"
                disabled={depositIndex === DEPOSIT_TOUR.length - 1}
                onClick={() => setDepositIndex((index) => index + 1)}
              >
                Next state
              </button>
            </div>
          </>
        ) : (
          <>
            <p className={styles.gateNotice}>
              Historical withdrawal states only. Nothing is sent. Canonical names follow PRODUCT_SPEC 9.3.
            </p>
            <div className={styles.uriBlock} aria-live="polite">
              <span className={styles.eyebrow}>{String(tourIndex + 1).padStart(2, "0")} / {String(WITHDRAWAL_TOUR.length).padStart(2, "0")}</span>
              <strong>{tour.title}</strong>
              <p>{tour.body}</p>
              <p className={styles.inlineNotice}>
                {payoutClaimStubCopy(tourClaim)}. Nothing is sent.
              </p>
            </div>
            <div className={styles.tourNav}>
              <button
                type="button"
                disabled={tourIndex === 0}
                onClick={() => setTourIndex((index) => index - 1)}
              >
                Previous state
              </button>
              <button
                type="button"
                disabled={tourIndex === WITHDRAWAL_TOUR.length - 1}
                onClick={() => setTourIndex((index) => index + 1)}
              >
                Next state
              </button>
            </div>
          </>
        )}
        <div
          id="destination-inspector"
          tabIndex={-1}
          role="region"
          aria-label="Transparent destination inspector"
        >
          <label className={styles.inputLabel}>
            <span>Transparent destination inspector</span>
            <div className={styles.inputShell}>
              <input
                value={destination}
                onChange={(event) => setDestination(event.target.value)}
                aria-label="Transparent destination to inspect"
                autoComplete="off"
                spellCheck={false}
              />
            </div>
          </label>
          <p className={styles.inlineNotice} aria-live="polite">
            {destinationCheck.message}
            {payoutPreview?.state === "screened"
              ? " Payout stub would accept this destination shape. Nothing is sent."
              : ""}
          </p>
        </div>
      </section>

      <aside
        id="privacy-callouts"
        className={`${styles.panel} ${styles.riskCard}`}
        aria-labelledby="privacy-title"
        tabIndex={-1}
      >
        <span className={styles.eyebrow}>Historical privacy boundary</span>
        <h2 id="privacy-title">Transparent custody was public onchain</h2>
        <p>
          Phlebas does not provide shielded deposits. A TEX address is a wallet-level safety
          mechanism, not proof that a coin has always remained transparent.
        </p>
        <div className={styles.callout}>
          <strong>Historical linkability</strong>
          <span>The removed custody model would have made transparent deposits, session movements, orders, fills, LP positions, and withdrawals linkable.</span>
        </div>
        <div className={styles.callout}>
          <strong>Historical reserve rule</strong>
          <span>The removed custody model required controlled reserve plus claim-matched principal in transit to cover every modeled liability. This application has no reserve or customer claim.</span>
        </div>
        <div className={styles.callout}>
          <strong>No wallet handoff</strong>
          <span>The ZIP 321 and TEX display is a non-payable format example. The interface offers no copy action or QR handoff, and never asks for a seed, spending key, or viewing key.</span>
        </div>
      </aside>
    </div>
  );
}
