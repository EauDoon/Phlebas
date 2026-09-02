// EVM event reducer. The reducer consumes a stream of EVM events from
// the EVM observer and emits a sorted sequence of mapped transitions
// for the coordinator. The reducer never holds a key, never signs a
// transaction, and never calls out to the network. The reducer is
// pure: same input always yields the same output.

import type { EVMEvent } from "./evm-observer.ts";
import { mapEVMEvent, type MappedTransition } from "./transition-mapper.ts";
import { normalizeHex32, type Hex32 } from "./order-domain.ts";

export type ReduceOptions = Readonly<{
  /**
   * Unix seconds for the block an event was seen in. Required, because
   * there is nothing on EVMEvent to fall back to.
   *
   * The fallback this replaces used event.blockNumber, and the comment
   * above it said it was taking the timestamp from the event record. No
   * such field exists. MappedTransition.observedAt flows on to the
   * coordinator as nowSeconds and into deadline arithmetic, so a block
   * number there is not an approximation of the time, it is a different
   * quantity in different units: a height near 18,500,000 read as a Unix
   * second is mid-1970, and every refund deadline computed from it is
   * anchored to a moment that never existed.
   */
  blockTimestamp: (event: EVMEvent) => bigint;
}>;

export function reduceEVMEvents(
  events: ReadonlyArray<EVMEvent>,
  options: ReduceOptions,
): ReadonlyArray<MappedTransition> {
  if (typeof options?.blockTimestamp !== "function") {
    throw new TypeError("EVM event reduction requires a block-timestamp source");
  }
  const out: MappedTransition[] = [];
  for (const event of events) {
    const fillId = normalizeHex32(event.fillId, "EVM event fill id");
    const observedAt = options.blockTimestamp(event);
    out.push(mapEVMEvent(event.kind, fillId as Hex32, observedAt));
  }
  out.sort((a, b) => {
    if (a.observedAt === b.observedAt) {
      if (a.fillId === b.fillId) return 0;
      return a.fillId < b.fillId ? -1 : 1;
    }
    return a.observedAt < b.observedAt ? -1 : 1;
  });
  return out;
}
