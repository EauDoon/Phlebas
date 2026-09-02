// Zcash event reducer. The reducer consumes a stream of ZEC outpoint
// events from the ZEC observer and emits a sorted sequence of mapped
// transitions for the coordinator. The reducer never holds a key,
// never signs a transaction, and never calls out to the network.

import type { ZcashOutpointEvent } from "./zcash-observer.ts";
import { mapZcashEvent, type MappedTransition } from "./transition-mapper.ts";
import { normalizeHex32, type Hex32 } from "./order-domain.ts";

export type ZcashReduceOptions = Readonly<{
  /**
   * Unix seconds for the block an event was seen in. Required, because
   * there is nothing on ZcashOutpointEvent to fall back to. The fallback
   * this replaces used event.blockHeight, which is a count of blocks and
   * not a time, and it reached the coordinator's deadline arithmetic as
   * though it were seconds.
   */
  blockTimestamp: (event: ZcashOutpointEvent) => bigint;
  // Lookup table: outpoint (txid:vout) -> fill id. The observer does
  // not know which fill id the P2SH address belongs to; the matcher
  // and the wallet adapter populate this lookup as they create or
  // observe fills. A missing entry means the reducer cannot map the
  // event and emits nothing for that entry.
  fillIdByOutpoint?: Readonly<Record<string, Hex32>>;
}>;

export function outpointKey(txid: string, vout: number): string {
  return `${txid.toLowerCase()}:${vout}`;
}

export function reduceZcashEvents(
  events: ReadonlyArray<ZcashOutpointEvent>,
  options: ZcashReduceOptions,
): ReadonlyArray<MappedTransition> {
  if (typeof options?.blockTimestamp !== "function") {
    throw new TypeError("Zcash event reduction requires a block-timestamp source");
  }
  const out: MappedTransition[] = [];
  for (const event of events) {
    const lookup = options.fillIdByOutpoint ?? {};
    const fillId = lookup[outpointKey(event.txid, event.vout)];
    if (!fillId) continue;
    normalizeHex32(fillId, "Zcash event fill id");
    const observedAt = options.blockTimestamp(event);
    out.push(mapZcashEvent(event.kind, fillId, observedAt));
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
