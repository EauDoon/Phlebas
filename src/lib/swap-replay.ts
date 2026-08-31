import { UINT64_MAX, normalizeHex32, type Hex32 } from "./order-domain.ts";
import { sha256Hex } from "./sha256.ts";
import { applySwapEvent, verifySwapJournal, type SwapJournal } from "./swap-journal.ts";
import { swapStateRoot } from "./swap-root.ts";
import type { SwapState } from "./swap-state.ts";

export const SWAP_SNAPSHOT_VERSION = 1 as const;

export type SwapSnapshot = Readonly<{
  version: typeof SWAP_SNAPSHOT_VERSION;
  swapId: Hex32;
  termsHash: Hex32;
  journalHead: Hex32;
  nextSequence: bigint;
  stateRoot: Hex32;
  snapshotRoot: Hex32;
}>;

function canonicalHex32(value: string, label: string): Hex32 {
  const normalized = normalizeHex32(value, label);
  if (normalized !== value) throw new TypeError(`${label} must be canonical`);
  return normalized;
}

export function replaySwapJournal(initial: SwapState, journal: SwapJournal): SwapState {
  if (!verifySwapJournal(journal)) throw new Error("Swap journal is invalid");
  if (journal.swapId !== initial.swapId || journal.termsHash !== initial.termsHash) {
    throw new Error("Swap journal does not bind the initial state");
  }
  if (journal.initialStateRoot !== swapStateRoot(initial)) throw new Error("Swap journal initial state root does not match");
  let state = initial;
  for (const receipt of journal.receipts) {
    if (receipt.priorStateRoot !== swapStateRoot(state)) throw new Error("Swap event prior state root does not match replay");
    state = applySwapEvent(state, receipt.payload);
    if (receipt.nextStateRoot !== swapStateRoot(state)) throw new Error("Swap event next state root does not match replay");
  }
  return state;
}

function snapshotPayload(snapshot: Omit<SwapSnapshot, "snapshotRoot">): string {
  if (snapshot.version !== SWAP_SNAPSHOT_VERSION) throw new TypeError("Unsupported swap snapshot version");
  if (typeof snapshot.nextSequence !== "bigint" || snapshot.nextSequence <= 0n || snapshot.nextSequence > UINT64_MAX) {
    throw new RangeError("Snapshot sequence must be a positive uint64");
  }
  return [
    "PhlebasSwapSnapshot",
    `version=${snapshot.version}`,
    `swapId=${canonicalHex32(snapshot.swapId, "Snapshot swap ID")}`,
    `termsHash=${canonicalHex32(snapshot.termsHash, "Snapshot terms hash")}`,
    `journalHead=${canonicalHex32(snapshot.journalHead, "Snapshot journal head")}`,
    `nextSequence=${snapshot.nextSequence}`,
    `stateRoot=${canonicalHex32(snapshot.stateRoot, "Snapshot state root")}`,
  ].join("\n");
}

export function createSwapSnapshot(initial: SwapState, journal: SwapJournal): SwapSnapshot {
  const state = replaySwapJournal(initial, journal);
  const unsigned: Omit<SwapSnapshot, "snapshotRoot"> = {
    version: SWAP_SNAPSHOT_VERSION,
    swapId: state.swapId,
    termsHash: state.termsHash,
    journalHead: journal.head,
    nextSequence: journal.nextSequence,
    stateRoot: swapStateRoot(state),
  };
  return Object.freeze({ ...unsigned, snapshotRoot: sha256Hex(snapshotPayload(unsigned)) });
}

export function restoreSwapSnapshot(initial: SwapState, journal: SwapJournal, snapshot: SwapSnapshot): SwapState {
  const { snapshotRoot, ...unsigned } = snapshot;
  if (sha256Hex(snapshotPayload(unsigned)) !== canonicalHex32(snapshotRoot, "Snapshot root")) {
    throw new Error("Swap snapshot root is invalid");
  }
  if (
    snapshot.swapId !== journal.swapId
    || snapshot.termsHash !== journal.termsHash
    || snapshot.journalHead !== journal.head
    || snapshot.nextSequence !== journal.nextSequence
  ) {
    throw new Error("Swap snapshot does not bind the complete journal");
  }
  const state = replaySwapJournal(initial, journal);
  if (snapshot.stateRoot !== swapStateRoot(state)) throw new Error("Swap snapshot state root does not match replay");
  return state;
}

export function verifySwapSnapshot(initial: SwapState, journal: SwapJournal, snapshot: SwapSnapshot): boolean {
  try {
    restoreSwapSnapshot(initial, journal, snapshot);
    return true;
  } catch {
    return false;
  }
}
