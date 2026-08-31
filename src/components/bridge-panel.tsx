"use client";

import { useRef, useState, type KeyboardEvent } from "react";

import { DEPOSIT_TOUR, depositTourStep } from "@/lib/deposit-tour";
import { inspectTransparentDestination } from "@/lib/zcash-address";
import {
  GATEWAY_JOURNEY_LABELS,
  GATEWAY_JOURNEYS,
  nextGatewayJourney,
  type GatewayJourney,
} from "@/lib/gateway-journeys";
import { payoutClaimForTourStep, screenPayout } from "@/lib/payout";
import { interpretRovingKey } from "@/lib/roving-keys";
import { isTestnetTex } from "@/lib/tex";
import { WITHDRAWAL_TOUR, withdrawalTourStep } from "@/lib/withdrawal-tour";
import { copyUri } from "@/lib/copy-uri";
import { syntheticDepositRequest } from "@/lib/zip321";

import { PlaceholderQr } from "./placeholder-qr";
import styles from "./terminal.module.css";

// Not payable. Not a payable QR. The reusable placeholder renderer carries the visual disclaimer.
export function BridgePanel({ initialJourney = "deposit" }: { initialJourney?: GatewayJourney }) {
  const [journey, setJourney] = useState<GatewayJourney>(initialJourney);
  const [journeyFocus, setJourneyFocus] = useState<GatewayJourney>("deposit");
  const journeyRefs = useRef<Partial<Record<GatewayJourney, HTMLButtonElement | null>>>({});
  const [depositIndex, setDepositIndex] = useState(0);
  const [tourIndex, setTourIndex] = useState(0);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [intent, setIntent] = useState<{ tex: string; request: string } | null>(null);
  const [gatewayNotice, setGatewayNotice] = useState("Local gateway off. No receivable address is displayed.");
  const [issuing, setIssuing] = useState(false);
  const tour = withdrawalTourStep(tourIndex);
  const deposit = depositTourStep(depositIndex);
  const destinationCheck = inspectTransparentDestination(destination);
  const payoutPreview = destination.trim().length === 0
    ? null
    : screenPayout(destination, 1n);
  const tourClaim = payoutClaimForTourStep(tour.id, destination);
  const request = intent?.request ?? syntheticDepositRequest();

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

  async function copyRequest() {
    const value = intent?.request ?? syntheticDepositRequest();
    setCopyNotice(await copyUri(
      value,
      navigator.clipboard,
      intent ? "testnet" : "placeholder",
    ));
  }

  async function issueTestnetTex() {
    setIssuing(true);
    setGatewayNotice("Issuing a local textest intent. Nothing is receivable until a loopback gateway answers.");
    try {
      const response = await fetch("/api/deposit-intent", { method: "POST" });
      const body = await response.json() as { tex?: string; request?: string; reason?: string };
      if (!response.ok || !body.tex || !body.request || !isTestnetTex(body.tex)) {
        setIntent(null);
        setGatewayNotice("Local gateway unavailable. No receivable address is displayed.");
        return;
      }
      setIntent({ tex: body.tex, request: body.request });
      setGatewayNotice("Testnet TEX issued for this session intent. Not mainnet, not pZEC credit.");
    } catch {
      setIntent(null);
      setGatewayNotice("Local gateway unavailable. No receivable address is displayed.");
    } finally {
      setIssuing(false);
    }
  }

  return (
    <div className={styles.featureGrid}>
      <section className={`${styles.panel} ${styles.featurePrimary}`} aria-labelledby="bridge-title">
        <div className={styles.panelHeader}>
          <div>
          <span className={styles.eyebrow}>Legacy custody simulation</span>
            <h2 id="bridge-title">ZEC to pZEC</h2>
          </div>
          <span className={styles.warningPill}>Not operational</span>
        </div>
        <p className={styles.featureLead}>
          This historical screen explains the superseded pZEC gateway fixture. The native-settlement
          target uses wallet-controlled conditional locks and does not mint a Phlebas ZEC receipt.
        </p>

        <div className={styles.poolTabs} role="group" aria-label="Gateway journey">
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
            <p className={styles.gateNotice}>
              {gatewayNotice}
            </p>
            {deposit.id !== "address-request" && (
            <div className={styles.uriBlock}>
              <span className={styles.eyebrow}>ZIP 321 testnet request</span>
              <code>{request}</code>
              <PlaceholderQr payload={request} />
              <small>
                {intent
                  ? `Receivable testnet TEX ${intent.tex}. Independent observation still required. No pZEC is minted here.`
                  : "Placeholder until the local gateway issues a textest address. Mainnet TEX is never shown."}
              </small>
              <button type="button" onClick={() => void issueTestnetTex()} disabled={issuing} aria-busy={issuing}>
                {issuing ? "Issuing" : "Issue testnet TEX"}
              </button>
              {intent ? (
                <button type="button" onClick={() => void copyRequest()}>
                  Copy testnet URI
                </button>
              ) : (
                <button type="button" onClick={() => void copyRequest()}>
                  Copy placeholder URI
                </button>
              )}
              {copyNotice && <p>{copyNotice}</p>}
            </div>
            )}
            <p className={styles.gateNotice}>
              Preview deposit states, not Deposit ZEC. Address request never shows a receivable address.
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
              Preview withdrawal states, not Withdraw ZEC. Canonical names follow PRODUCT_SPEC 9.3.
            </p>
            <div className={styles.uriBlock} aria-live="polite">
              <span className={styles.eyebrow}>{String(tourIndex + 1).padStart(2, "0")} / {String(WITHDRAWAL_TOUR.length).padStart(2, "0")}</span>
              <strong>{tour.title}</strong>
              <p>{tour.body}</p>
              <p className={styles.inlineNotice}>
                Stub claim: {tourClaim.state}. Nothing is sent.
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
        <span className={styles.eyebrow}>Privacy boundary</span>
        <h2 id="privacy-title">Transparent in, public onchain</h2>
        <p>
          Phlebas does not provide shielded deposits. A TEX address is a wallet-level safety
          mechanism, not proof that a coin has always remained transparent.
        </p>
        <div className={styles.callout}>
          <strong>Public linkability</strong>
          <span>Deposits, pZEC movements, orders, fills, LP positions, and withdrawals may be linkable.</span>
        </div>
        <div className={styles.callout}>
          <strong>Reserve rule</strong>
          <span>Confirmed controlled reserve plus separately reported, claim-matched principal in transit must cover every pZEC and pending customer claim. In-transit principal is not reusable reserve.</span>
        </div>
        <div className={styles.callout}>
          <strong>No wallet connector</strong>
          <span>ZIP 321 and TEX are a copy or QR handoff. The interface never asks for a seed, spending key, or viewing key.</span>
        </div>
      </aside>
    </div>
  );
}
