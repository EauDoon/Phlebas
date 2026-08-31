"use client";

import { useState } from "react";

import { DEPOSIT_TOUR, depositTourStep } from "@/lib/deposit-tour";
import { inspectTransparentDestination } from "@/lib/zcash-address";
import { payoutClaimForTourStep, screenPayout } from "@/lib/payout";
import { isTestnetTex } from "@/lib/tex";
import { WITHDRAWAL_TOUR, withdrawalTourStep } from "@/lib/withdrawal-tour";
import { copyUri } from "@/lib/copy-uri";
import { syntheticDepositRequest } from "@/lib/zip321";

import styles from "./terminal.module.css";

function PlaceholderZipQr() {
  return (
    <figure className={styles.placeholderQr}>
      <svg viewBox="0 0 29 29" role="img" aria-label="Not a payable QR. Placeholder ZIP 321 only.">
        <rect width="29" height="29" fill="#f4f1e6" />
        {([[1, 1], [21, 1], [1, 21]] as const).map(([x, y]) => (
          <g key={`${x}-${y}`}>
            <rect x={x} y={y} width="7" height="7" fill="#11130f" />
            <rect x={x + 1} y={y + 1} width="5" height="5" fill="#f4f1e6" />
            <rect x={x + 2} y={y + 2} width="3" height="3" fill="#11130f" />
          </g>
        ))}
        <rect x="11" y="11" width="7" height="7" fill="#11130f" />
        <rect x="13" y="13" width="3" height="3" fill="#f4f1e6" />
        <rect x="10" y="4" width="2" height="2" fill="#11130f" />
        <rect x="16" y="5" width="2" height="2" fill="#11130f" />
        <rect x="4" y="12" width="2" height="2" fill="#11130f" />
        <rect x="23" y="14" width="2" height="2" fill="#11130f" />
        <rect x="12" y="22" width="2" height="2" fill="#11130f" />
      </svg>
      <figcaption>Not payable. No receivable address is encoded.</figcaption>
    </figure>
  );
}

export function BridgePanel() {
  const [journey, setJourney] = useState<"deposit" | "withdrawal">("deposit");
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
            <span className={styles.eyebrow}>Transparent Zcash gateway</span>
            <h2 id="bridge-title">ZEC to pZEC</h2>
          </div>
          <span className={styles.warningPill}>Not operational</span>
        </div>
        <p className={styles.featureLead}>
          Native ZEC cannot live inside an EVM liquidity pool. Phlebas therefore specifies a
          fully reserved pZEC receipt for trading and LP settlement. That gateway introduces
          custody, operator, and regulatory risk.
        </p>

        <div className={styles.poolTabs} role="group" aria-label="Gateway journey">
          <button
            type="button"
            className={journey === "deposit" ? styles.poolActive : undefined}
            aria-pressed={journey === "deposit"}
            onClick={() => setJourney("deposit")}
          >
            Deposit preview
          </button>
          <button
            type="button"
            className={journey === "withdrawal" ? styles.poolActive : undefined}
            aria-pressed={journey === "withdrawal"}
            onClick={() => setJourney("withdrawal")}
          >
            Withdrawal states
          </button>
        </div>

        {journey === "deposit" ? (
          <>
            <p className={styles.gateNotice}>
              {gatewayNotice}
            </p>
            <div className={styles.uriBlock}>
              <span className={styles.eyebrow}>ZIP 321 testnet request</span>
              <code>{intent?.request ?? syntheticDepositRequest()}</code>
              <PlaceholderZipQr />
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
      </section>

      <aside className={`${styles.panel} ${styles.riskCard}`} aria-labelledby="privacy-title">
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
