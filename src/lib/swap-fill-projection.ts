// Legacy, no-value fill projection retained for the observer demo and the
// read-only /swap route. This module is not settlement authority and must not
// construct, sign, recommend, or broadcast wallet actions. Canonical native
// settlement state lives in swap-state.ts and is committed by swap-journal.ts.

import { normalizeHex32, type Hex32 } from "./order-domain.ts";

export type DiagnosticLegState = "pending" | "funded" | "claimed" | "refunded";

export type DiagnosticFillState =
  | "proposed"
  | "awaiting-zec-fund"
  | "awaiting-zec-claim"
  | "awaiting-evm-claim"
  | "settled"
  | "evm-refundable"
  | "zec-refundable"
  | "evm-refunded"
  | "zec-refunded"
  | "fully-refunded"
  | "disputed";

export type DiagnosticFillLeg = Readonly<{
  state: DiagnosticLegState;
  observedAt: bigint;
}>;

export type DiagnosticFill = Readonly<{
  fillId: Hex32;
  evmLeg: DiagnosticFillLeg;
  zecLeg: DiagnosticFillLeg;
  evmRefundAfter: bigint;
  zecRefundAfter: bigint;
  disputed: boolean;
}>;

export type DiagnosticTransition =
  | "evm-leg-funded"
  | "zec-leg-funded"
  | "zec-leg-claimed"
  | "evm-leg-claimed"
  | "evm-leg-refunded"
  | "zec-leg-refunded"
  | "evm-refund-deadline-passed"
  | "zec-refund-deadline-passed"
  | "mark-disputed"
  | "resolve-disputed";

export type DiagnosticTransitionError =
  | "fill-not-found"
  | "fill-disputed"
  | "evm-deadline-not-passed"
  | "zec-deadline-not-passed"
  | "evm-leg-not-funded"
  | "zec-leg-not-funded"
  | "evm-already-claimed"
  | "zec-already-claimed"
  | "evm-not-refundable-yet"
  | "zec-not-refundable-yet";

export class FillProjectionError extends Error {
  readonly kind: DiagnosticTransitionError;
  readonly fillId: Hex32;

  constructor(kind: DiagnosticTransitionError, fillId: Hex32) {
    super(`Fill projection rejected (${kind}) for fill ${fillId}`);
    this.kind = kind;
    this.fillId = fillId;
  }
}

function assertFill(fill: DiagnosticFill): void {
  if (typeof fill !== "object" || fill === null) throw new TypeError("Fill projection must be an object");
  normalizeHex32(fill.fillId, "Fill projection id");
  if (fill.evmRefundAfter < 0n) throw new RangeError("EVM refund deadline must be non-negative");
  if (fill.zecRefundAfter < 0n) throw new RangeError("ZEC refund deadline must be non-negative");
  if (fill.evmRefundAfter >= fill.zecRefundAfter) {
    throw new RangeError("EVM refund deadline must be strictly earlier than ZEC refund deadline");
  }
}

export function emptyDiagnosticFill(fillId: Hex32, evmRefundAfter: bigint, zecRefundAfter: bigint): DiagnosticFill {
  const candidate: DiagnosticFill = {
    fillId,
    evmLeg: { state: "pending", observedAt: 0n },
    zecLeg: { state: "pending", observedAt: 0n },
    evmRefundAfter,
    zecRefundAfter,
    disputed: false,
  };
  assertFill(candidate);
  return candidate;
}

function setLeg(_leg: DiagnosticFillLeg, next: DiagnosticLegState, at: bigint): DiagnosticFillLeg {
  return { state: next, observedAt: at };
}

export function diagnosticStateOf(fill: DiagnosticFill): DiagnosticFillState {
  if (fill.disputed) return "disputed";
  if (fill.evmLeg.state === "claimed" && fill.zecLeg.state === "claimed") return "settled";
  if (fill.evmLeg.state === "refunded" && fill.zecLeg.state === "refunded") return "fully-refunded";
  if (fill.evmLeg.state === "refunded") return "evm-refunded";
  if (fill.zecLeg.state === "refunded") return "zec-refunded";
  if (fill.evmLeg.state === "funded" && fill.zecLeg.state === "claimed") return "awaiting-evm-claim";
  if (fill.evmLeg.state === "funded" && fill.zecLeg.state === "funded") return "awaiting-zec-claim";
  if (fill.evmLeg.state === "funded") return "awaiting-zec-fund";
  return "proposed";
}

export function isDiagnosticTerminal(state: DiagnosticFillState): boolean {
  return state === "settled" || state === "fully-refunded" || state === "disputed";
}

export function isDiagnosticEvmRefundReady(fill: DiagnosticFill, nowSeconds: bigint): boolean {
  return fill.evmLeg.state === "funded" && nowSeconds >= fill.evmRefundAfter;
}

export function isDiagnosticZecRefundReady(fill: DiagnosticFill, nowSeconds: bigint): boolean {
  if (fill.zecLeg.state === "claimed" || fill.zecLeg.state === "refunded") return false;
  return nowSeconds >= fill.zecRefundAfter;
}

export function applyDiagnosticTransition(
  fill: DiagnosticFill,
  event: DiagnosticTransition,
  nowSeconds: bigint,
): DiagnosticFill {
  assertFill(fill);
  if (nowSeconds < 0n) throw new RangeError("Transition time must be non-negative");

  if (event === "mark-disputed") {
    if (fill.disputed) throw new FillProjectionError("fill-disputed", fill.fillId);
    return { ...fill, disputed: true };
  }
  if (event === "resolve-disputed") {
    if (!fill.disputed) throw new FillProjectionError("fill-not-found", fill.fillId);
    return { ...fill, disputed: false };
  }
  if (fill.disputed) throw new FillProjectionError("fill-disputed", fill.fillId);

  switch (event) {
    case "evm-leg-funded":
      if (fill.evmLeg.state !== "pending") throw new FillProjectionError("evm-already-claimed", fill.fillId);
      return { ...fill, evmLeg: setLeg(fill.evmLeg, "funded", nowSeconds) };
    case "zec-leg-funded":
      if (fill.zecLeg.state !== "pending") throw new FillProjectionError("zec-already-claimed", fill.fillId);
      return { ...fill, zecLeg: setLeg(fill.zecLeg, "funded", nowSeconds) };
    case "zec-leg-claimed":
      if (fill.zecLeg.state !== "funded") throw new FillProjectionError("zec-leg-not-funded", fill.fillId);
      return { ...fill, zecLeg: setLeg(fill.zecLeg, "claimed", nowSeconds) };
    case "evm-leg-claimed":
      if (fill.evmLeg.state !== "funded") throw new FillProjectionError("evm-leg-not-funded", fill.fillId);
      return { ...fill, evmLeg: setLeg(fill.evmLeg, "claimed", nowSeconds) };
    case "evm-leg-refunded":
      if (fill.evmLeg.state !== "funded") throw new FillProjectionError("evm-leg-not-funded", fill.fillId);
      if (nowSeconds < fill.evmRefundAfter) throw new FillProjectionError("evm-deadline-not-passed", fill.fillId);
      return { ...fill, evmLeg: setLeg(fill.evmLeg, "refunded", nowSeconds) };
    case "zec-leg-refunded":
      if (fill.zecLeg.state !== "funded") throw new FillProjectionError("zec-leg-not-funded", fill.fillId);
      if (nowSeconds < fill.zecRefundAfter) throw new FillProjectionError("zec-deadline-not-passed", fill.fillId);
      return { ...fill, zecLeg: setLeg(fill.zecLeg, "refunded", nowSeconds) };
    case "evm-refund-deadline-passed":
      if (!isDiagnosticEvmRefundReady(fill, nowSeconds)) throw new FillProjectionError("evm-not-refundable-yet", fill.fillId);
      return { ...fill };
    case "zec-refund-deadline-passed":
      if (!isDiagnosticZecRefundReady(fill, nowSeconds)) throw new FillProjectionError("zec-not-refundable-yet", fill.fillId);
      return { ...fill };
  }
}

export type ProjectedNextStep =
  | "observe-dispute"
  | "observe-evm-funding"
  | "observe-zec-funding"
  | "observe-zec-spend"
  | "observe-evm-spend"
  | "observe-evm-timeout"
  | "observe-zec-timeout"
  | "observe-terminal";

export function projectedDiagnosticNextStep(fill: DiagnosticFill, nowSeconds: bigint): ProjectedNextStep {
  if (fill.disputed) return "observe-dispute";
  if (isDiagnosticTerminal(diagnosticStateOf(fill))) return "observe-terminal";
  if (isDiagnosticZecRefundReady(fill, nowSeconds)) return "observe-zec-timeout";
  if (isDiagnosticEvmRefundReady(fill, nowSeconds) || nowSeconds >= fill.evmRefundAfter) return "observe-evm-timeout";
  if (fill.evmLeg.state === "pending") return "observe-evm-funding";
  if (fill.zecLeg.state === "pending") return "observe-zec-funding";
  if (fill.zecLeg.state === "funded") return "observe-zec-spend";
  return "observe-evm-spend";
}
