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
  reorgDepth: bigint;
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
    if (fill.evmLeg.observedAt > 0n && nowSeconds - fill.evmLeg.observedAt < config.reorgDepth) {
      if (fill.evmLeg.state === "refunded" || fill.evmLeg.state === "claimed") {
        alerts.push({
          fillId,
          alert: "reorg-depth-exceeded",
          message: `EVM leg ${fill.evmLeg.state} observed within reorg depth ${config.reorgDepth}`,
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
