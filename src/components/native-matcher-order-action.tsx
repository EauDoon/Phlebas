"use client";

import { useEffect, useRef, useState } from "react";

import type { MarketId } from "@/lib/market-data";
import {
  bindNativeMatcherConfirmationOutcome,
  bindNativeMatcherOrderReview,
  nativeMatcherOrderActionState,
  type NativeMatcherDeploymentState,
  type NativeMatcherOrderConfirmationOutcome,
  type NativeMatcherOrderReview,
  type NativeMatcherOrderReviewInput,
  type NativeMatcherOrderWorkflow,
} from "@/lib/native-matcher-order-action";

import styles from "./terminal.module.css";

export type NativeMatcherOrderActionProps = Readonly<{
  marketId: MarketId;
  deployment: NativeMatcherDeploymentState;
  workflow?: NativeMatcherOrderWorkflow;
  reviewInput?: NativeMatcherOrderReviewInput;
}>;

/**
 * This surface deliberately has no wallet, matcher, or signing imports. A
 * future client workflow may be injected only after a manifest enables it.
 */
export function NativeMatcherOrderAction({
  marketId,
  deployment,
  workflow,
  reviewInput,
}: NativeMatcherOrderActionProps) {
  const workflowMatchesMarket = workflow !== undefined
    && reviewInput !== undefined
    && reviewInput.marketId === marketId;
  const state = nativeMatcherOrderActionState(marketId, deployment, workflowMatchesMarket);
  const [pending, setPending] = useState<Readonly<{
    marketId: MarketId;
    deployment: NativeMatcherDeploymentState;
    workflow: NativeMatcherOrderWorkflow;
    review: NativeMatcherOrderReview;
  }> | null>(null);
  const [busy, setBusy] = useState<"review" | "confirm" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<NativeMatcherOrderConfirmationOutcome | null>(null);
  const contextRef = useRef({ marketId, deployment, workflow });
  /* eslint-disable react-hooks/refs -- synchronously invalidate in-flight work before a changed context commits */
  const renderedContext = contextRef.current;
  if (renderedContext.marketId !== marketId
    || renderedContext.deployment !== deployment
    || renderedContext.workflow !== workflow) {
    contextRef.current = { marketId, deployment, workflow };
  }
  /* eslint-enable react-hooks/refs */

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- context changes must retire every visible review artifact */
    setPending(null);
    setOutcome(null);
    setNotice(null);
    setBusy(null);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [marketId, deployment, workflow]);

  async function requestReview() {
    if (state.kind !== "workflow-ready" || !workflow || !reviewInput || reviewInput.marketId !== marketId) return;
    setBusy("review");
    setNotice(null);
    setOutcome(null);
    const operationContext = contextRef.current;
    try {
      const value = await workflow.review(reviewInput);
      if (contextRef.current !== operationContext) return;
      const review = bindNativeMatcherOrderReview(reviewInput, value, deployment);
      setPending({ marketId, deployment, workflow, review });
      setNotice("Exact order terms are frozen for confirmation. Check every field before continuing.");
    } catch {
      if (contextRef.current !== operationContext) return;
      setPending(null);
      setNotice("Native matcher order review failed before confirmation.");
    } finally {
      if (contextRef.current === operationContext) setBusy(null);
    }
  }

  async function confirmReview() {
    if (state.kind !== "workflow-ready" || !workflow || !pending
      || pending.marketId !== marketId || pending.deployment !== deployment || pending.workflow !== workflow) return;
    setBusy("confirm");
    setNotice(null);
    setOutcome(null);
    const operationContext = contextRef.current;
    try {
      const value = await pending.workflow.confirm(pending.review);
      if (contextRef.current !== operationContext) return;
      const confirmedOutcome = bindNativeMatcherConfirmationOutcome(pending.review, value);
      setOutcome(confirmedOutcome);
      setNotice(confirmedOutcome.kind === "confirmed" && confirmedOutcome.verified
        ? `Order accepted by verified matcher receipt sequence ${confirmedOutcome.receiptSequence.toString()}.`
        : confirmedOutcome.kind === "rejected"
          ? `Matcher rejected the reviewed order with status ${confirmedOutcome.status}.`
          : "Matcher receipt is unknown. Do not treat this order as accepted.");
    } catch {
      if (contextRef.current !== operationContext) return;
      setNotice("Native matcher order confirmation was not completed.");
    } finally {
      if (contextRef.current === operationContext) setBusy(null);
    }
  }

  const currentPending = pending?.marketId === marketId
    && pending.deployment === deployment
    && pending.workflow === workflow
    ? pending
    : null;
  return (
    <section
      id="native-matcher-order-action"
      tabIndex={-1}
      className={`${styles.panel} ${styles.nativeMatcherPanel}`}
      aria-labelledby="native-matcher-order-action-title"
      data-native-matcher-state={state.kind}
      data-native-matcher-outcome={outcome?.kind ?? "none"}
    >
      <div className={styles.panelHeader}>
        <h2 id="native-matcher-order-action-title">Native matcher order</h2>
        <span className={styles.statusDot}>{state.kind === "workflow-ready" ? "Review enabled" : "Unavailable"}</span>
      </div>
      <div className={styles.ticketBlocked} role="status" aria-live="polite">
        <p>{state.message}</p>
        <p>{state.sellNotice}</p>
        {state.kind === "workflow-ready" ? (
          <>
            {currentPending ? (
              <dl>
                <div><dt>Market</dt><dd>{currentPending.review.marketId}</dd></div>
                <div><dt>Side</dt><dd>Buy</dd></div>
                <div><dt>Price ticks</dt><dd>{currentPending.review.priceTicks.toString()}</dd></div>
                <div><dt>Size atoms</dt><dd>{currentPending.review.sizeAtoms.toString()}</dd></div>
                <div><dt>Expiry</dt><dd>{currentPending.review.expiryUnix === 0n ? "none" : currentPending.review.expiryUnix.toString()}</dd></div>
                <div><dt>Zcash recipient</dt><dd>{currentPending.review.zcashRecipient}</dd></div>
                <div><dt>Request binding</dt><dd>{currentPending.review.requestId}</dd></div>
                <div><dt>Configuration binding</dt><dd>{currentPending.review.configurationHash}</dd></div>
              </dl>
            ) : null}
            <button type="button" disabled={busy !== null} onClick={requestReview}>
              {busy === "review" ? "Reviewing..." : "Review native buy"}
            </button>
            {currentPending && outcome === null ? (
              <button type="button" disabled={busy !== null} onClick={confirmReview}>
                {busy === "confirm" ? "Confirming..." : "Confirm reviewed order"}
              </button>
            ) : null}
          </>
        ) : null}
        {notice ? <p>{notice}</p> : null}
      </div>
    </section>
  );
}
