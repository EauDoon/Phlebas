// Health check for the atomic-swap observer. The health endpoint
// reports whether the coordinator has been bootstrapped, how many
// fills are tracked, and the current cursor. The endpoint never
// returns the fills themselves; the dedicated /fills/:fillId route
// returns per-fill state.

import type { CoordinatorState } from "../../src/lib/atomic-coordinator.ts";

export type ServiceHealth = Readonly<{
  ok: boolean;
  bootstrap: "ready" | "missing" | "error";
  fillCount: number;
  cursor: string;
  alertCount: number;
  reorgDepth: bigint;
  pollIntervalSeconds: bigint;
}>;

export function buildHealth(
  state: CoordinatorState,
  reorgDepth: bigint,
  pollIntervalSeconds: bigint,
  bootstrap: "ready" | "missing" | "error",
): ServiceHealth {
  return {
    ok: bootstrap === "ready",
    bootstrap,
    fillCount: Object.keys(state.fills).length,
    cursor: state.cursor.toString(),
    alertCount: state.alertLog.length,
    reorgDepth,
    pollIntervalSeconds,
  };
}
