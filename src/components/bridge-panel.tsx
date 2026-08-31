"use client";

import { useState } from "react";

import { copyUri } from "@/lib/copy-uri";
import { inspectTransparentDestination } from "@/lib/zcash-address";
import { payoutClaimForTourStep, screenPayout } from "@/lib/payout";
import { isTestnetTex } from "@/lib/tex";
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
    title: "Mint pZEC after the risk-tier threshold",
    body: "One outpoint would authorize at most one 8-decimal receipt. pZEC is a custody claim, not native ZEC.",
  },
] as const;

const withdrawalTour = [
  { id: "requested", title: "Requested", body: "Amount, transparent destination, network fee, service fee, and net output would be reviewed before any burn." },
  { id: "screened", title: "Screened", body: "Eligibility and destination checks run here. Signing the pZEC burn is the last action of this state." },
  { id: "burn submitted", title: "Burn submitted", body: "An unfinalized pZEC burn is on Arbitrum. The simulation does not submit a transaction." },
  { id: "burn finalized", title: "Burn finalized", body: "After Arbitrum finality the burn is consumed once and a native payout claim exists." },
  { id: "payable", title: "Payable", body: "The ledger owes transparent ZEC. No Zcash transaction has been signed." },
  { id: "transaction_prepared", title: "Transaction prepared", body: "One claim maps to one native transaction. No completion time is promised." },
  { id: "signed", title: "Signed", body: "The exact bytes and transaction ID are committed. They cannot be swapped for a different payout." },
  { id: "broadcast", title: "Broadcast", body: "Only those committed bytes may be rebroadcast. Transparent activity is public." },
  { id: "mined", title: "Mined", body: "The payout is in a Zcash block. The close threshold has not been met." },
  { id: "confirmed", title: "Confirmed", body: "State demonstration complete. No pZEC was burned and no native ZEC was sent." },
] as const;

export function BridgePanel({
  initialJourney = "deposit",
}: {
  initialJourney?: "deposit" | "withdrawal";
}) {
  const [journey, setJourney] = useState<"deposit" | "withdrawal">(initialJourney);
  const [tourIndex, setTourIndex] = useState(0);
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [destination, setDestination] = useState("");
  const [intent, setIntent] = useState<{ tex: string; request: string } | null>(null);
  const [gatewayNotice, setGatewayNotice] = useState("Local gateway off. No receivable address is displayed.");
  const [issuing, setIssuing] = useState(false);
  const tour = withdrawalTour[tourIndex];
  const destinationCheck = inspectTransparentDestination(destination);
  const payoutPreview = destination.trim().length === 0
    ? null
    : screenPayout(destination, 1n);
  const tourClaim = payoutClaimForTourStep(tour.id, destination);
  const request = intent?.request ?? syntheticDepositRequest();

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
              <span className={styles.eyebrow}>{String(tourIndex + 1).padStart(2, "0")} / {String(withdrawalTour.length).padStart(2, "0")}</span>
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
                disabled={tourIndex === withdrawalTour.length - 1}
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
