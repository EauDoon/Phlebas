"use client";

import type { MarketId } from "@/lib/market-data";
import {
  nativeMatcherOrderActionState,
  type NativeMatcherOrderWorkflow,
} from "@/lib/native-matcher-order-action";
import type { NativeZecUsdcMatcherDeploymentState } from "@/lib/native-zec-usdc-matcher-manifest";

import styles from "./terminal.module.css";

export type NativeMatcherOrderActionProps = Readonly<{
  marketId: MarketId;
  deployment: NativeZecUsdcMatcherDeploymentState;
  workflow?: NativeMatcherOrderWorkflow;
}>;

/**
 * This surface deliberately has no wallet, matcher, or signing imports. A
 * future client workflow may be injected only after a manifest enables it.
 */
export function NativeMatcherOrderAction({
  marketId,
  deployment,
}: NativeMatcherOrderActionProps) {
  const state = nativeMatcherOrderActionState(marketId, deployment);
  const reasonId = "native-matcher-order-action-reason";

  return (
    <section
      id="native-matcher-order-action"
      tabIndex={-1}
      className={`${styles.panel} ${styles.ticket}`}
      aria-labelledby="native-matcher-order-action-title"
      data-native-matcher-state={state.kind}
    >
      <div className={styles.panelHeader}>
        <h2 id="native-matcher-order-action-title">Native matcher order</h2>
        <span className={styles.statusDot}>Unavailable</span>
      </div>
      <div className={styles.ticketBlocked} role="status" aria-live="polite">
        <strong>{state.heading}</strong>
        <p id={reasonId}>{state.message}</p>
        <p>{state.sellNotice}</p>
      </div>
      <button
        type="button"
        className={styles.primaryAction}
        disabled
        aria-describedby={reasonId}
      >
        Native matcher unavailable
      </button>
    </section>
  );
}
