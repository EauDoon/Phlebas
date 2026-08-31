// EVM event reducer. The reducer consumes a stream of EVM events from
// the EVM observer and emits a sorted sequence of mapped transitions
// for the coordinator. The reducer never holds a key, never signs a
// transaction, and never calls out to the network. The reducer is
// pure: same input always yields the same output.

import type { EVMEvent } from "./evm-observer.ts";
import { mapEVMEvent, type MappedTransition } from "./transition-mapper.ts";
import { normalizeHex32, type Hex32 } from "./order-domain.ts";

export type ReduceOptions = Readonly<{
  // Block timestamp oracle. Defaults to taking the timestamp from the
  // event record. Tests inject a fixed value to keep results
  // deterministic.
  blockTimestamp?: (event: EVMEvent) => bigint;
}>;

export function reduceEVMEvents(
  events: ReadonlyArray<EVMEvent>,
  options: ReduceOptions = {},
): ReadonlyArray<MappedTransition> {
  const out: MappedTransition[] = [];
  for (const event of events) {
    const fillId = normalizeHex32(event.fillId, "EVM event fill id");
    const observedAt = options.blockTimestamp ? options.blockTimestamp(event) : event.blockNumber;
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
