"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

import type { MarketId } from "@/lib/market-data";
import {
  CLAIM_REFUND_EXCLUSIVE,
  SETTLEMENT_MATCHER_HONESTY,
  SETTLEMENT_PROGRESS_STEPS,
  USDT_SETTLEMENT_DISABLED,
  formatSettlementTime,
  settlementLockCopy,
  settlementPhaseCopy,
  settlementEvidence,
  settlementTermsRows,
  settlementTicketAction,
  type SettlementTicketScenario,
} from "@/lib/settlement-ticket-copy";
import { terminalUrl } from "@/lib/terminal-url";

import {
  advanceNativeSwapFixture,
  createNativeSwapFixture,
  nativeSwapScenarios,
  type NativeSwapFixture,
} from "./native-swap-fixtures";
import styles from "./terminal.module.css";

export function SettlementTicket({
  marketId,
  onMarketChange,
  variant = "full",
  activeFillId,
}: {
  marketId: MarketId;
  onMarketChange?: (marketId: MarketId) => void;
  variant?: "full" | "compact";
  activeFillId?: string;
}) {
  const [scenario, setScenario] = useState<SettlementTicketScenario>("happy");
  const [ticket, setTicket] = useState<NativeSwapFixture>(() => createNativeSwapFixture(marketId));
  const [announcement, setAnnouncement] = useState("Matched fill ready for review.");
  const phaseHeading = useRef<HTMLHeadingElement>(null);
  const shouldFocusPhase = useRef(false);
  const compact = variant === "compact";
  const locks = settlementLockCopy();

  useEffect(() => {
    if (!shouldFocusPhase.current) return;
    shouldFocusPhase.current = false;
    phaseHeading.current?.focus();
  }, [ticket]);

  function replaceTicket(nextTicket: NativeSwapFixture, message: string) {
    shouldFocusPhase.current = !compact;
    setTicket(nextTicket);
    setAnnouncement(message);
  }

  function selectScenario(nextScenario: SettlementTicketScenario) {
    setScenario(nextScenario);
    replaceTicket(
      createNativeSwapFixture(marketId, nextScenario),
      `${nativeSwapScenarios.find((item) => item.id === nextScenario)?.label ?? "Evidence case"} loaded.`,
    );
  }

  function resetTicket() {
    setScenario("happy");
    replaceTicket(createNativeSwapFixture(marketId), "Fill ticket reset to the matched state.");
  }

  if (ticket.availability === "disabled") {
    const disabledReasonId = "native-swap-disabled-reason";
    if (compact) {
      return (
        <section
          id="fill-ticket"
          tabIndex={-1}
          className={`${styles.panel} ${styles.settlementTicket} ${styles.compactTicket}`}
          aria-labelledby="fill-ticket-title"
        >
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Fill ticket</span>
              <h2 id="fill-ticket-title">{USDT_SETTLEMENT_DISABLED.title}</h2>
            </div>
            <span className={styles.warningPill}>Settlement disabled</span>
          </div>
          <p id={disabledReasonId} className={styles.compactLead}>{ticket.reason}</p>
          <button type="button" className={styles.primaryAction} disabled aria-describedby={disabledReasonId}>
            Claim disabled
          </button>
        </section>
      );
    }
    return (
      <div className={styles.featureGrid}>
        <section className={`${styles.panel} ${styles.featurePrimary}`} aria-labelledby="native-swap-title">
          <div className={styles.panelHeader}>
            <div>
              <span className={styles.eyebrow}>Fill ticket</span>
              <h2 id="native-swap-title" ref={phaseHeading} tabIndex={-1}>{USDT_SETTLEMENT_DISABLED.title}</h2>
            </div>
            <span className={styles.warningPill}>Settlement disabled</span>
          </div>
          <p className={styles.featureLead}>{USDT_SETTLEMENT_DISABLED.body}</p>
          {onMarketChange ? (
            <div className={styles.settlementToolbar}>
              <label>
                <span>Settlement market</span>
                <select
                  aria-label="Selected settlement market"
                  value={marketId}
                  onChange={(event) => onMarketChange(event.target.value as MarketId)}
                >
                  <option value="ZEC/USDC">ZEC / USDC</option>
                  <option value="ZEC/USDT">ZEC / USDT</option>
                </select>
              </label>
            </div>
          ) : null}
          <div className={`${styles.settlementActionCard} ${styles.settlementUnavailable}`}>
            <p id={disabledReasonId}>{ticket.reason}</p>
            <button
              type="button"
              className={styles.primaryAction}
              disabled
              aria-describedby={disabledReasonId}
            >
              Claim disabled
            </button>
          </div>
        </section>
        <aside className={`${styles.panel} ${styles.riskCard}`} aria-labelledby="usdt-boundary-title">
          <span className={styles.eyebrow}>Listing boundary</span>
          <h2 id="usdt-boundary-title">{USDT_SETTLEMENT_DISABLED.headline}</h2>
          <p>{USDT_SETTLEMENT_DISABLED.body}</p>
          <ul className={styles.cleanList}>
            <li>No fill terms were generated.</li>
            <li>No wallet or transaction control is available.</li>
            <li>Select ZEC / USDC for the USDC fill ticket.</li>
          </ul>
        </aside>
      </div>
    );
  }

  const { session } = ticket;
  const phase = settlementPhaseCopy(session);
  const action = settlementTicketAction(session);
  const evidence = settlementEvidence(session);
  const terms = settlementTermsRows(session.state);
  const disabledReasonId = action.disabledReason ? "native-swap-action-disabled" : undefined;
  const dispute = session.state.disputes.at(-1);

  function advanceTicket() {
    if (!action.enabled) return;
    const result = advanceNativeSwapFixture(session);
    replaceTicket({ availability: "ready", session: result.session }, result.announcement);
  }

  if (compact) {
    return (
      <section
        id="fill-ticket"
        tabIndex={-1}
        className={`${styles.panel} ${styles.settlementTicket} ${styles.compactTicket}`}
        aria-labelledby="fill-ticket-title"
      >
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>{activeFillId ? `Fill ${activeFillId}` : "Fill ticket"}</span>
            <h2 id="fill-ticket-title">{phase.title}</h2>
          </div>
          <Link href={terminalUrl({ view: "settlement", market: marketId })} className={styles.textButton}>
            Open
          </Link>
        </div>
        <p className={styles.compactLead}>{locks.zec.detail} {locks.evm.detail} {CLAIM_REFUND_EXCLUSIVE}</p>
        {dispute ? (
          <div className={styles.unsafeNotice} role="alert">
            <strong>Unsafe evidence</strong>
            <span>{dispute.detail}</span>
          </div>
        ) : null}
        {action.disabledReason ? <p id={disabledReasonId} className={styles.disabledReason}>{action.disabledReason}</p> : null}
        <div className={styles.settlementActions}>
          <button
            type="button"
            className={styles.primaryAction}
            disabled={!action.enabled}
            aria-describedby={disabledReasonId}
            onClick={advanceTicket}
          >
            {action.label}
          </button>
        </div>
        <dl className={styles.compactLocks}>
          <div><dt>USDC refund</dt><dd>{formatSettlementTime(session.state.terms.evmRefundTime)}</dd></div>
          <div><dt>ZEC refund</dt><dd>{formatSettlementTime(session.state.terms.zecRefundTime)}</dd></div>
        </dl>
        <p className={styles.srOnly} aria-live="polite" aria-atomic="true">{announcement}</p>
      </section>
    );
  }

  return (
    <div className={styles.featureGrid}>
      <section className={`${styles.panel} ${styles.featurePrimary}`} aria-labelledby="native-swap-title">
        <div className={styles.panelHeader}>
          <div>
            <span className={styles.eyebrow}>Fill ticket</span>
            <h2 id="native-swap-title" ref={phaseHeading} tabIndex={-1}>Fill ticket</h2>
          </div>
          <span className={styles.warningPill}>USDC first</span>
        </div>

        <p className={styles.featureLead}>
          {locks.zec.detail} {locks.evm.detail} {CLAIM_REFUND_EXCLUSIVE} {SETTLEMENT_MATCHER_HONESTY}
        </p>

        <div className={styles.settlementToolbar}>
          {onMarketChange ? (
            <label>
              <span>Settlement market</span>
              <select
                aria-label="Selected settlement market"
                value={marketId}
                onChange={(event) => onMarketChange(event.target.value as MarketId)}
              >
                <option value="ZEC/USDC">ZEC / USDC</option>
                <option value="ZEC/USDT">ZEC / USDT</option>
              </select>
            </label>
          ) : null}
          <label>
            <span>Evidence case</span>
            <select
              aria-label="Evidence case"
              value={scenario}
              onChange={(event) => selectScenario(event.target.value as SettlementTicketScenario)}
            >
              {nativeSwapScenarios.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </select>
          </label>
        </div>

        <ol className={styles.settlementSteps} aria-label="Fill ticket progress">
          {SETTLEMENT_PROGRESS_STEPS.map(([number, label, detail], index) => (
            <li
              key={number}
              data-state={index < phase.stage ? "complete" : index === phase.stage ? "current" : "pending"}
              aria-current={index === phase.stage ? "step" : undefined}
            >
              <span aria-hidden="true">{number}</span>
              <div>
                <strong>{label}</strong>
                <small>{detail}</small>
              </div>
              {index === phase.stage && <span className={styles.srOnly}>Current step</span>}
            </li>
          ))}
        </ol>

        <div className={styles.settlementCore}>
          <section className={styles.settlementPhase} aria-labelledby="fill-phase-title">
            <span className={styles.eyebrow}>Current ticket state</span>
            <h3 id="fill-phase-title" ref={phaseHeading} tabIndex={-1}>{phase.title}</h3>
            <p>{phase.body}</p>
            {dispute && (
              <div className={styles.unsafeNotice} role="alert">
                <strong>Unsafe evidence</strong>
                <span>{dispute.detail} Reset the ticket before funding or claiming.</span>
              </div>
            )}
          </section>

          <section className={styles.settlementActionCard} aria-labelledby="fill-action-title">
            <span className={styles.eyebrow}>Next safe action</span>
            <h3 id="fill-action-title">{action.label}</h3>
            <p>This control advances ticket state only. It prepares no transaction and requests no approval.</p>
            {action.disabledReason && <p id={disabledReasonId} className={styles.disabledReason}>{action.disabledReason}</p>}
            <div className={styles.settlementActions}>
              <button
                type="button"
                className={styles.primaryAction}
                disabled={!action.enabled}
                aria-describedby={disabledReasonId}
                onClick={advanceTicket}
              >
                {action.label}
              </button>
              <button type="button" className={styles.textButton} onClick={resetTicket}>Reset ticket</button>
            </div>
          </section>

          <section className={styles.refundCard} aria-labelledby="fill-refund-title">
            <span className={styles.eyebrow}>Recovery path</span>
            <h3 id="fill-refund-title">Later-deadline ZEC refund</h3>
            <p>
              The target protocol keeps a wallet-controlled refund path for each funder. This preview signs
              nothing, and a future refund remains unavailable before the applicable deadline.
              {" "}{CLAIM_REFUND_EXCLUSIVE}
            </p>
            <dl>
              <div><dt>USDC refund</dt><dd>{formatSettlementTime(session.state.terms.evmRefundTime)}</dd></div>
              <div><dt>ZEC refund</dt><dd>{formatSettlementTime(session.state.terms.zecRefundTime)}</dd></div>
              <div><dt>Safety margin</dt><dd>600 seconds</dd></div>
            </dl>
          </section>

          <section className={styles.termsCard} aria-labelledby="fill-terms-title">
            <span className={styles.eyebrow}>Immutable fill terms</span>
            <h3 id="fill-terms-title">Exact assets and locks</h3>
            <dl>
              {terms.map((row) => (
                <div key={row.label}>
                  <dt>{row.label}</dt>
                  <dd>{row.code ? <code>{row.value}</code> : row.value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className={styles.evidenceCard} aria-labelledby="fill-evidence-title">
            <span className={styles.eyebrow}>Progress evidence</span>
            <h3 id="fill-evidence-title">Domain projection</h3>
            <div className={styles.tableScroll}>
              <table className={styles.evidenceTable}>
                <caption className={styles.srOnly}>Current fill ticket evidence</caption>
                <tbody>
                  <tr><th scope="row">Domain phase</th><td>{evidence.domainPhase}</td></tr>
                  <tr><th scope="row">ZEC leg</th><td>{evidence.zecLeg}</td></tr>
                  <tr><th scope="row">EVM leg</th><td>{evidence.evmLeg}</td></tr>
                  <tr><th scope="row">Observer</th><td>{evidence.observerEvidence}</td></tr>
                  <tr><th scope="row">Swap ID</th><td><code>{evidence.swapId}</code></td></tr>
                  <tr><th scope="row">Terms hash</th><td><code>{evidence.termsHash}</code></td></tr>
                  <tr><th scope="row">State root</th><td><code>{evidence.stateRoot}</code></td></tr>
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <p
          className={styles.srOnly}
          aria-live="polite"
          aria-atomic="true"
          data-testid="native-swap-live"
        >
          {announcement}
        </p>
      </section>

      <aside className={`${styles.panel} ${styles.riskCard}`} aria-labelledby="settlement-boundary-title">
        <span className={styles.eyebrow}>User boundary</span>
        <h2 id="settlement-boundary-title">Public chains remain linkable.</h2>
        <p>
          Transparent Zcash and EVM activity can be publicly linked through amounts, timing, recipients, and the shared preimage.
          This screen is a fill ticket, not privacy protection.
        </p>
        <ul className={styles.cleanList}>
          <li>No wallet connection or address entry.</li>
          <li>No transaction build, signature, approval, broadcast, or API request.</li>
          <li>No pZEC. The matcher cannot move funds.</li>
          <li>A ticket result does not authorize testnet or mainnet use.</li>
        </ul>
      </aside>
    </div>
  );
}
