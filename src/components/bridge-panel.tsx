"use client";

import { useState } from "react";

import { DEPOSIT_TOUR, depositTourStep } from "@/lib/deposit-tour";
import { copyUri } from "@/lib/copy-uri";
import {
  gatewayIssuedCopy,
  gatewayIssuingCopy,
  gatewayOffCopy,
  gatewayUnavailableCopy,
} from "@/lib/gateway-copy";
import { inspectTransparentDestination } from "@/lib/zcash-address";
import { payoutClaimForTourStep, payoutClaimStubCopy, screenPayout } from "@/lib/payout";
import { isTestnetTex } from "@/lib/tex";
import { WITHDRAWAL_TOUR, withdrawalTourStep } from "@/lib/withdrawal-tour";
import { syntheticDepositRequest } from "@/lib/zip321";

import { PlaceholderQr } from "./placeholder-qr";
import styles from "./terminal.module.css";

const depositSteps = [
  {
    number: "01",
    title: "Issue one TEX intent",
    body: "The local testnet gateway issues one ZIP 320 textest address per intent and never reassigns it. Mainnet encodings are not generated.",
  },
  {
    number: "02",
    title: "Hand off a ZIP 321 request",
    body: "The wallet-neutral payload is a zcash: URI and QR. There is no EVM connector, WalletConnect session, or seed prompt.",
  },
  {
    number: "03",
    title: "Observe the final transparent payment",
    body: "Independent Zebra observers would bind the outpoint, amount, destination, and tip. Zero-confirmation credit is never allowed.",
  },
  {
    number: "04",
    title: "Mint after the risk-tier threshold",
    body: "One outpoint would authorize at most one 8-decimal receipt. This preview is not live settlement.",
  },
] as const;

export function BridgePanel({
  initialJourney = "deposit",
}: {
  initialJourney?: "deposit" | "withdrawal";
}) {
  const [journey, setJourney] = useState<"deposit" | "withdrawal">(initialJourney);
  const [depositIndex, setDepositIndex] = useState(0);
  const [tourIndex, setTourIndex] = useState(0);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [intent, setIntent] = useState<{ tex: string; request: string } | null>(null);
  const [gatewayNotice, setGatewayNotice] = useState(gatewayOffCopy());
  const [issuing, setIssuing] = useState(false);
  const tour = withdrawalTourStep(tourIndex);
  const deposit = depositTourStep(depositIndex);
  const destinationCheck = inspectTransparentDestination(destination);
  const payoutPreview = destination.trim().length === 0
    ? null
    : screenPayout(destination, 1n);
  const tourClaim = payoutClaimForTourStep(tour.id, destination);
  const request = intent?.request ?? syntheticDepositRequest();

  async function issueTestnetTex() {
    setIssuing(true);
    setGatewayNotice(gatewayIssuingCopy());
    try {
      const response = await fetch("/api/deposit-intent", { method: "POST" });
      const body = await response.json() as { tex?: string; request?: string; reason?: string };
      if (!response.ok || !body.tex || !body.request || !isTestnetTex(body.tex)) {
        setIntent(null);
        setGatewayNotice(gatewayUnavailableCopy());
        return;
      }
      setIntent({ tex: body.tex, request: body.request });
      setGatewayNotice(gatewayIssuedCopy());
    } catch {
      setIntent(null);
      setGatewayNotice(gatewayUnavailableCopy());
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
            <h2 id="bridge-title">ZEC gateway</h2>
          </div>
          <span className={styles.warningPill}>Not operational</span>
        </div>
        <p className={styles.featureLead}>
          Native ZEC cannot live inside an EVM liquidity pool. This preview labels ZEC-USDC and
          ZEC-USDT. It is not live settlement. A future gateway would still introduce custody,
          operator, and regulatory risk.
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
            {deposit.id !== "address-request" && (
            <div className={styles.uriBlock}>
              <span className={styles.eyebrow}>ZIP 321 testnet request</span>
              <code>{request}</code>
              <PlaceholderQr payload={request} />
              <small>
                {intent
                  ? `Receivable testnet TEX ${intent.tex}. Independent observation still required. Nothing is minted here.`
                  : "Placeholder until the local gateway issues a textest address. Mainnet TEX is never shown."}
              </small>
              <button type="button" onClick={() => void issueTestnetTex()} disabled={issuing} aria-busy={issuing}>
                {issuing ? "Issuing" : "Issue testnet TEX"}
              </button>
              <button
                type="button"
                onClick={() => {
                  void copyUri(request, navigator.clipboard).then(setCopyNotice);
                }}
              >
                Copy testnet URI
              </button>
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
            <ol className={styles.stepList}>
              {depositSteps.map((step) => (
                <li key={step.number}>
                  <span>{step.number}</span>
                  <div><h3>{step.title}</h3><p>{step.body}</p></div>
                </li>
              ))}
            </ol>
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
                {payoutClaimStubCopy(tourClaim)}. Nothing is sent.
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
          <span>Deposits, session movements, orders, fills, LP positions, and withdrawals may be linkable.</span>
        </div>
        <div className={styles.callout}>
          <strong>Reserve rule</strong>
          <span>Confirmed controlled reserve plus separately reported, claim-matched principal in transit must cover every session liability and pending customer claim. In-transit principal is not reusable reserve.</span>
        </div>
        <div className={styles.callout}>
          <strong>No wallet connector</strong>
          <span>ZIP 321 and TEX are a copy or QR handoff. The interface never asks for a seed, spending key, or viewing key.</span>
        </div>
      </aside>
    </div>
  );
}
