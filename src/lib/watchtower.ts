// Watchtower: pure function that reads the coordinator's per-fill
// state and emits alerts on stop conditions. The watchtower never
// takes any action. The matcher, the wallet adapter, or the user
// consumes the alerts. The watchtower never holds a key and never
// signs a transaction.

import type { CoordinatorState } from "./atomic-coordinator.ts";

export type AlertClass =
  | "reorg-depth-exceeded"
  | "observer-disagreement"
  | "missing-terminal-event"
  | "witness-mismatch"
  | "deadline-breach";

export type WatchtowerAlert = Readonly<{
  fillId: string;
  alert: AlertClass;
  message: string;
  recommendedAction: string;
  at: bigint;
}>;

export type WatchtowerConfig = Readonly<{
  /**
   * How long after a terminal observation a reorganization could still
   * undo it, in SECONDS.
   *
   * This used to be reorgDepth, and reorgDepth is a count of blocks
   * everywhere else in the repository: reorg-detector.ts calls it
   * depthBlocks and derives it from two tip heights. Comparing a seconds
   * delta against it meant the alert stopped firing a handful of seconds
   * after the observation instead of after a block-scaled window. Ten
   * blocks is roughly two minutes on Ethereum and twelve on Zcash, and
   * the two chains do not share the number, so the window has to be
   * stated in the unit the comparison is actually made in.
   */
  reorgWindowSeconds: bigint;
  deadlineBuffer: bigint;
}>;

export function detectAlerts(
  state: CoordinatorState,
  nowSeconds: bigint,
  config: WatchtowerConfig,
): ReadonlyArray<WatchtowerAlert> {
  const alerts: WatchtowerAlert[] = [];
  for (const fillId of Object.keys(state.fills)) {
    const fill = state.fills[fillId];
    if (!fill) continue;
    if (fill.evmLeg.observedAt > 0n && nowSeconds - fill.evmLeg.observedAt < config.reorgWindowSeconds) {
      if (fill.evmLeg.state === "refunded" || fill.evmLeg.state === "claimed") {
        alerts.push({
          fillId,
          alert: "reorg-depth-exceeded",
          message: `EVM leg ${fill.evmLeg.state} observed within the ${config.reorgWindowSeconds}s reorganization window`,
          recommendedAction: "verify the canonical journal independently; do not act from this diagnostic",
          at: nowSeconds,
        });
      }
    }
    if (fill.evmLeg.state === "funded" && fill.zecLeg.state === "funded") {
      const latestObservation = fill.evmLeg.observedAt > fill.zecLeg.observedAt
        ? fill.evmLeg.observedAt
        : fill.zecLeg.observedAt;
      const minTerminalDeadline = latestObservation + fill.evmRefundAfter + config.deadlineBuffer;
      if (nowSeconds > minTerminalDeadline) {
        alerts.push({
          fillId,
          alert: "missing-terminal-event",
          message: `Both legs funded but no terminal event by ${minTerminalDeadline}`,
          recommendedAction: "verify the canonical journal independently; do not claim or refund from this diagnostic",
          at: nowSeconds,
        });
      }
    }
    if (nowSeconds >= fill.evmRefundAfter && fill.evmLeg.state === "funded") {
      alerts.push({
        fillId,
        alert: "deadline-breach",
        message: `EVM refund deadline ${fill.evmRefundAfter} passed with EVM leg still funded`,
        recommendedAction: "verify the canonical journal independently; do not refund from this diagnostic",
        at: nowSeconds,
      });
    }
  }
  return alerts;
}
