// Legacy observer projection retained for the no-value service demo. It
// consumes incomplete chain observations and persists a read model only.
// It is not settlement authority and must never drive a wallet. Canonical
// settlement state is the signed SwapState committed by SwapJournal.

import {
  applyDiagnosticTransition,
  diagnosticStateOf,
  emptyDiagnosticFill,
  isDiagnosticTerminal,
  projectedDiagnosticNextStep,
  type DiagnosticFill,
  type DiagnosticTransition,
} from "./swap-fill-projection.ts";

export type CoordinatorState = Readonly<{
  fills: Readonly<Record<string, DiagnosticFill>>;
  cursor: bigint;
  alertLog: ReadonlyArray<{ fillId: string; alert: string; at: bigint }>;
}>;

// Default refund windows applied when a fill is first observed by the
// coordinator. The EVM leg gets a shorter window (10.4 days) so the
// buyer can refund the EVM side first; the ZEC leg gets a longer
// window (20.8 days) so the seller has time to claim the ZEC leg.
// Both numbers are well above the worst-case reorg depth and the
// EVM deadline must be strictly earlier than the ZEC deadline, as
// the swap-state invariant requires.
export const DEFAULT_EVM_REFUND_OFFSET_SECONDS = 900_000n;
export const DEFAULT_ZEC_REFUND_OFFSET_SECONDS = 1_800_000n;

export function emptyCoordinator(): CoordinatorState {
  return { fills: {}, cursor: 0n, alertLog: [] };
}

export function applyTransition(
  state: CoordinatorState,
  fillId: string,
  event: DiagnosticTransition,
  nowSeconds: bigint,
): CoordinatorState {
  const fill =
    state.fills[fillId] ??
    emptyDiagnosticFill(
      fillId as `0x${string}`,
      nowSeconds + DEFAULT_EVM_REFUND_OFFSET_SECONDS,
      nowSeconds + DEFAULT_ZEC_REFUND_OFFSET_SECONDS,
    );
  let nextFill: DiagnosticFill;
  try {
    nextFill = applyDiagnosticTransition(fill, event, nowSeconds);
  } catch (error: unknown) {
    return {
      ...state,
      alertLog: [
        ...state.alertLog,
        { fillId, alert: error instanceof Error ? error.message : "transition-error", at: nowSeconds },
      ],
    };
  }
  return {
    ...state,
    fills: { ...state.fills, [fillId]: nextFill },
    cursor: state.cursor + 1n,
  };
}

export function applyAlert(
  state: CoordinatorState,
  fillId: string,
  alert: string,
  nowSeconds: bigint,
): CoordinatorState {
  return {
    ...state,
    alertLog: [...state.alertLog, { fillId, alert, at: nowSeconds }],
  };
}

export function getFill(state: CoordinatorState, fillId: string): DiagnosticFill | null {
  return state.fills[fillId] ?? null;
}

export function listFills(state: CoordinatorState): ReadonlyArray<DiagnosticFill> {
  return Object.values(state.fills);
}

export function listAlerts(state: CoordinatorState): ReadonlyArray<{ fillId: string; alert: string; at: bigint }> {
  return state.alertLog;
}

export function currentStateOf(state: CoordinatorState, fillId: string): string {
  const fill = state.fills[fillId];
  return fill ? diagnosticStateOf(fill) : "unknown";
}

export function projectedNextStepFor(
  state: CoordinatorState,
  fillId: string,
  nowSeconds: bigint,
): string {
  const fill = state.fills[fillId];
  if (!fill) return "unknown-fill";
  return projectedDiagnosticNextStep(fill, nowSeconds);
}

export function isFillTerminal(state: CoordinatorState, fillId: string): boolean {
  const fill = state.fills[fillId];
  if (!fill) return false;
  return isDiagnosticTerminal(diagnosticStateOf(fill));
}
