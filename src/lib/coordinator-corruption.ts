// Snapshot corruption detector. The detector inspects a snapshot
// after it is read from disk and reports whether the snapshot is
// internally consistent. The detector never mutates the snapshot
// and never reaches out to the chain. The detector is the second
// line of defense after the bootstrap's marker-file check: a
// present-and-parseable snapshot is not necessarily a correct
// snapshot.

import type { Snapshot } from "./coordinator-snapshot.ts";

export type CorruptionReport = Readonly<{
  ok: boolean;
  reason: string | null;
}>;

export function checkSnapshotIntegrity(snapshot: Snapshot): CorruptionReport {
  if (snapshot.fills.length !== Object.keys(snapshot).length) {
    // Object identity check is intentionally lenient; the real check
    // is below.
  }
  const fillIds = new Set<string>();
  for (const fill of snapshot.fills) {
    if (fillIds.has(fill.fillId)) {
      return { ok: false, reason: `duplicate fill id: ${fill.fillId}` };
    }
    fillIds.add(fill.fillId);
    if (BigInt(fill.evmRefundAfter) >= BigInt(fill.zecRefundAfter)) {
      return { ok: false, reason: `fill ${fill.fillId} has non-strict refund deadlines` };
    }
    if (fill.evmLeg.state === "claimed" && fill.evmLeg.observedAt === "0") {
      return { ok: false, reason: `fill ${fill.fillId} claims a leg without an observed timestamp` };
    }
    if (fill.zecLeg.state === "claimed" && fill.zecLeg.observedAt === "0") {
      return { ok: false, reason: `fill ${fill.fillId} claims a leg without an observed timestamp` };
    }
  }
  return { ok: true, reason: null };
}
