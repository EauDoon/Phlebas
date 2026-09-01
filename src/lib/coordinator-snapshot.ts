// Coordinator snapshot: serializes and deserializes the coordinator
// state to and from a JSON document. The on-disk format is a single
// object with version, fills, cursor, and alertLog fields. Fills are
// stored with their full state so the snapshot is a deterministic
// point-in-time view. The snapshot is the input to
// coordinator-persistence and the output of coordinator-restore.

import type { CoordinatorState } from "./atomic-coordinator.ts";
import type { DiagnosticFill } from "./swap-fill-projection.ts";
import { emptyCoordinator } from "./atomic-coordinator.ts";
import { emptyDiagnosticFill } from "./swap-fill-projection.ts";
import { normalizeHex32, type Hex32 } from "./order-domain.ts";

export const SNAPSHOT_FORMAT_VERSION = 1 as const;

export type SnapshotFill = Readonly<{
  fillId: Hex32;
  evmLeg: Readonly<{ state: DiagnosticFill["evmLeg"]["state"]; observedAt: string }>;
  zecLeg: Readonly<{ state: DiagnosticFill["zecLeg"]["state"]; observedAt: string }>;
  evmRefundAfter: string;
  zecRefundAfter: string;
  disputed: boolean;
}>;

export type Snapshot = Readonly<{
  version: typeof SNAPSHOT_FORMAT_VERSION;
  cursor: string;
  fills: ReadonlyArray<SnapshotFill>;
  alertLog: ReadonlyArray<{ fillId: string; alert: string; at: string }>;
}>;

function fillToSnapshot(fill: DiagnosticFill): SnapshotFill {
  return {
    fillId: fill.fillId,
    evmLeg: { state: fill.evmLeg.state, observedAt: fill.evmLeg.observedAt.toString() },
    zecLeg: { state: fill.zecLeg.state, observedAt: fill.zecLeg.observedAt.toString() },
    evmRefundAfter: fill.evmRefundAfter.toString(),
    zecRefundAfter: fill.zecRefundAfter.toString(),
    disputed: fill.disputed,
  };
}

function fillFromSnapshot(snap: SnapshotFill): DiagnosticFill {
  const evmRefundAfter = BigInt(snap.evmRefundAfter);
  const zecRefundAfter = BigInt(snap.zecRefundAfter);
  const base = emptyDiagnosticFill(normalizeHex32(snap.fillId, "snapshot fill id"), evmRefundAfter, zecRefundAfter);
  return {
    ...base,
    evmLeg: { state: snap.evmLeg.state, observedAt: BigInt(snap.evmLeg.observedAt) },
    zecLeg: { state: snap.zecLeg.state, observedAt: BigInt(snap.zecLeg.observedAt) },
    disputed: snap.disputed,
  };
}

export function snapshotToJSON(state: CoordinatorState): Snapshot {
  return {
    version: SNAPSHOT_FORMAT_VERSION,
    cursor: state.cursor.toString(),
    fills: Object.values(state.fills).map(fillToSnapshot),
    alertLog: state.alertLog.map((entry) => ({
      fillId: entry.fillId,
      alert: entry.alert,
      at: entry.at.toString(),
    })),
  };
}

export function snapshotFromJSON(snapshot: Snapshot): CoordinatorState {
  if (snapshot.version !== SNAPSHOT_FORMAT_VERSION) {
    throw new RangeError(`Unsupported snapshot version: ${String(snapshot.version)}`);
  }
  const fills: Record<string, DiagnosticFill> = {};
  for (const snap of snapshot.fills) {
    const fill = fillFromSnapshot(snap);
    fills[fill.fillId] = fill;
  }
  return {
    fills,
    cursor: BigInt(snapshot.cursor),
    alertLog: snapshot.alertLog.map((entry) => ({
      fillId: entry.fillId,
      alert: entry.alert,
      at: BigInt(entry.at),
    })),
  };
}

export function emptySnapshot(): Snapshot {
  return snapshotToJSON(emptyCoordinator());
}
