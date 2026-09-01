// Transition mapper: maps the typed event records produced by the
// EVM and ZEC observers to the transition names consumed by the swap
// state machine. The mapper is a pure function: it takes an event
// kind and a fill id and returns a transition name plus the deadline
// to use when the fill is first observed. The mapper never reaches
// into the coordinator state.

import type { EVMEventKind } from "./evm-observer.ts";
import type { ZcashOutpointKind } from "./zcash-observer.ts";
import type { DiagnosticTransition } from "./swap-fill-projection.ts";
import type { Hex32 } from "./order-domain.ts";

export type EventSide = "evm" | "zec";

export type MappedTransition = Readonly<{
  side: EventSide;
  transition: DiagnosticTransition;
  observedAt: bigint;
  fillId: Hex32;
}>;

export function mapEVMEvent(
  kind: EVMEventKind,
  fillId: Hex32,
  blockTimestamp: bigint,
): MappedTransition {
  switch (kind) {
    case "deposited":
      return { side: "evm", transition: "evm-leg-funded", observedAt: blockTimestamp, fillId };
    case "claimed":
      return { side: "evm", transition: "evm-leg-claimed", observedAt: blockTimestamp, fillId };
    case "refunded":
      return { side: "evm", transition: "evm-leg-refunded", observedAt: blockTimestamp, fillId };
  }
}

export function mapZcashEvent(
  kind: ZcashOutpointKind,
  fillId: Hex32,
  blockTimestamp: bigint,
): MappedTransition {
  switch (kind) {
    case "funded":
      return { side: "zec", transition: "zec-leg-funded", observedAt: blockTimestamp, fillId };
    case "claimed":
      return { side: "zec", transition: "zec-leg-claimed", observedAt: blockTimestamp, fillId };
    case "refunded":
      return { side: "zec", transition: "zec-leg-refunded", observedAt: blockTimestamp, fillId };
  }
}
