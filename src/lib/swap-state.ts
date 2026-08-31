// Deterministic atomic-swap state machine. One fill, two legs, no time, no
// random, no I/O. The matcher and the observer push transitions; the UI
// derives the current label from the state. See docs/adr/0004-atomic-swap-state-machine.md.

import { normalizeHex32, type Hex32 } from "./order-domain.ts";

export type LegState = "pending" | "funded" | "claimed" | "refunded";

export type FillState =
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

export type FillLeg = Readonly<{
  state: LegState;
  observedAt: bigint;
}>;

export type Fill = Readonly<{
  fillId: Hex32;
  evmLeg: FillLeg;
  zecLeg: FillLeg;
  evmRefundAfter: bigint;
  zecRefundAfter: bigint;
  disputed: boolean;
}>;

export type Transition =
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

export type TransitionError =
  | "fill-not-found"
  | "fill-disputed"
  | "leg-already-claimed"
  | "leg-already-refunded"
  | "evm-deadline-not-passed"
  | "zec-deadline-not-passed"
  | "evm-leg-not-funded"
  | "zec-leg-not-funded"
  | "evm-already-claimed"
  | "zec-already-claimed"
  | "evm-already-refunded"
  | "zec-already-refunded"
  | "evm-not-refundable-yet"
  | "zec-not-refundable-yet"
  | "fill-already-settled"
  | "fill-already-fully-refunded";

export class SwapStateError extends Error {
  readonly kind: TransitionError;
  readonly fillId: Hex32;
  constructor(kind: TransitionError, fillId: Hex32) {
    super(`Swap transition rejected (${kind}) for fill ${fillId}`);
    this.kind = kind;
    this.fillId = fillId;
  }
}

function assertFill(fill: Fill): void {
  if (typeof fill !== "object" || fill === null) {
    throw new TypeError("Fill must be an object");
  }
  normalizeHex32(fill.fillId, "Fill id");
  if (fill.evmRefundAfter < 0n) throw new RangeError("EVM refund deadline must be non-negative");
  if (fill.zecRefundAfter < 0n) throw new RangeError("ZEC refund deadline must be non-negative");
  if (fill.evmRefundAfter >= fill.zecRefundAfter) {
    throw new RangeError("EVM refund deadline must be strictly earlier than ZEC refund deadline");
  }
}

export function emptyFill(fillId: Hex32, evmRefundAfter: bigint, zecRefundAfter: bigint): Fill {
  const candidate: Fill = {
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

function setLeg(leg: FillLeg, next: LegState, at: bigint): FillLeg {
  return { state: next, observedAt: at };
}

function combined(fill: Fill): FillState {
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

export function stateOf(fill: Fill): FillState {
  return combined(fill);
}

export function isTerminal(state: FillState): boolean {
  return state === "settled" || state === "fully-refunded" || state === "disputed";
}

export function isEvmRefundReady(fill: Fill, nowSeconds: bigint): boolean {
  return (
    fill.evmLeg.state === "funded" &&
    nowSeconds >= fill.evmRefundAfter
  );
}

export function isZecRefundReady(fill: Fill, nowSeconds: bigint): boolean {
  if (fill.zecLeg.state === "claimed" || fill.zecLeg.state === "refunded") return false;
  return nowSeconds >= fill.zecRefundAfter;
}

export function transition(fill: Fill, event: Transition, nowSeconds: bigint): Fill {
  assertFill(fill);
  if (nowSeconds < 0n) throw new RangeError("Transition time must be non-negative");

  if (event === "mark-disputed") {
    if (fill.disputed) throw new SwapStateError("fill-disputed", fill.fillId);
    return { ...fill, disputed: true };
  }
  if (event === "resolve-disputed") {
    if (!fill.disputed) throw new SwapStateError("fill-not-found", fill.fillId);
    return { ...fill, disputed: false };
  }
  if (fill.disputed) throw new SwapStateError("fill-disputed", fill.fillId);

  switch (event) {
    case "evm-leg-funded": {
      if (fill.evmLeg.state !== "pending") throw new SwapStateError("evm-already-claimed", fill.fillId);
      return { ...fill, evmLeg: setLeg(fill.evmLeg, "funded", nowSeconds) };
    }
    case "zec-leg-funded": {
      if (fill.zecLeg.state !== "pending") throw new SwapStateError("zec-already-claimed", fill.fillId);
      return { ...fill, zecLeg: setLeg(fill.zecLeg, "funded", nowSeconds) };
    }
    case "zec-leg-claimed": {
      if (fill.zecLeg.state !== "funded") throw new SwapStateError("zec-leg-not-funded", fill.fillId);
      return { ...fill, zecLeg: setLeg(fill.zecLeg, "claimed", nowSeconds) };
    }
    case "evm-leg-claimed": {
      if (fill.evmLeg.state !== "funded") throw new SwapStateError("evm-leg-not-funded", fill.fillId);
      return { ...fill, evmLeg: setLeg(fill.evmLeg, "claimed", nowSeconds) };
    }
    case "evm-leg-refunded": {
      if (fill.evmLeg.state !== "funded") throw new SwapStateError("evm-leg-not-funded", fill.fillId);
      if (nowSeconds < fill.evmRefundAfter) {
        throw new SwapStateError("evm-deadline-not-passed", fill.fillId);
      }
      return { ...fill, evmLeg: setLeg(fill.evmLeg, "refunded", nowSeconds) };
    }
    case "zec-leg-refunded": {
      if (fill.zecLeg.state !== "funded") throw new SwapStateError("zec-leg-not-funded", fill.fillId);
      if (nowSeconds < fill.zecRefundAfter) {
        throw new SwapStateError("zec-deadline-not-passed", fill.fillId);
      }
      return { ...fill, zecLeg: setLeg(fill.zecLeg, "refunded", nowSeconds) };
    }
    case "evm-refund-deadline-passed": {
      if (!isEvmRefundReady(fill, nowSeconds)) {
        throw new SwapStateError("evm-not-refundable-yet", fill.fillId);
      }
      return { ...fill };
    }
    case "zec-refund-deadline-passed": {
      if (!isZecRefundReady(fill, nowSeconds)) {
        throw new SwapStateError("zec-not-refundable-yet", fill.fillId);
      }
      return { ...fill };
    }
    default: {
      const exhaustive: never = event;
      throw new TypeError(`Unknown transition: ${String(exhaustive)}`);
    }
  }
}

export function nextAction(fill: Fill, nowSeconds: bigint, role: "buyer" | "seller" | "watcher"): string {
  if (fill.disputed) return "halt";
  const evmRefundReady = isEvmRefundReady(fill, nowSeconds);
  const zecRefundReady = isZecRefundReady(fill, nowSeconds);
  const evmFunded = fill.evmLeg.state === "funded";
  const zecLegStarted = fill.zecLeg.state === "funded" || fill.zecLeg.state === "claimed";
  const zecClaimed = fill.zecLeg.state === "claimed";
  const evmClaimed = fill.evmLeg.state === "claimed";

  if (role === "watcher") {
    if (zecRefundReady) return "observe-zec-timeout";
    if (evmRefundReady || nowSeconds >= fill.evmRefundAfter) return "observe-evm-timeout";
    return "observe";
  }

  if (evmFunded && evmRefundReady && role === "buyer") return "refund-evm";
  if (zecLegStarted && zecRefundReady && role === "seller") return "refund-zec";

  if (!evmFunded) {
    if (role === "buyer") return "fund-evm";
    return "wait-for-evm-fund";
  }
  if (!zecLegStarted) {
    if (role === "seller") return "fund-zec";
    return "wait-for-zec-fund";
  }
  if (!zecClaimed) {
    if (role === "buyer") return "claim-zec";
    return "wait-for-zec-claim";
  }
  if (!evmClaimed) {
    if (role === "seller") return "claim-evm";
    return "wait-for-evm-claim";
  }
  return "wait";
}

export function isRole(state: FillState, role: "buyer" | "seller" | "watcher", nowSeconds: bigint, fill: Fill): boolean {
  if (role === "watcher") return true;
  if (state === "proposed") return role === "buyer";
  if (state === "awaiting-zec-fund") return role === "seller";
  if (state === "awaiting-zec-claim") return role === "buyer";
  if (state === "awaiting-evm-claim") return role === "seller";
  if (state === "evm-refundable") return role === "buyer" && isEvmRefundReady(fill, nowSeconds);
  if (state === "zec-refundable") return role === "seller" && isZecRefundReady(fill, nowSeconds);
  return false;
}
