import type { Hex32 } from "../../src/lib/order-domain.ts";
import { appendSwapEvent, type SwapEventPayload, type SwapJournal } from "../../src/lib/swap-journal.ts";
import { replaySwapJournal } from "../../src/lib/swap-replay.ts";
import { swapStateRoot } from "../../src/lib/swap-root.ts";

/** Key-independent ingestion only; source verification and durable commit remain caller responsibilities. */
export function ingestSwapEvidence(
  journal: SwapJournal,
  expectedJournalHead: Hex32,
  expectedStateRoot: Hex32,
  payload: Extract<SwapEventPayload, { kind: "observe-funding" | "observe-spend" }>,
): ReturnType<typeof appendSwapEvent> {
  if (journal.head !== expectedJournalHead) throw new Error("Observer ingestion journal head is stale or conflicting");
  const state = replaySwapJournal(journal.initialState, journal);
  if (swapStateRoot(state) !== expectedStateRoot) throw new Error("Observer ingestion state root does not match replay");
  if (payload?.kind !== "observe-funding" && payload?.kind !== "observe-spend") {
    throw new TypeError("Observer ingestion accepts only funding or spend observations");
  }
  const ownedPayload = structuredClone(payload);
  const result = appendSwapEvent(journal, state, ownedPayload);
  // Preserve the accepted bytes against later mutation by the source or receipt consumer.
  Object.freeze(ownedPayload.evidence.fact);
  Object.freeze(ownedPayload.evidence.attestation);
  Object.freeze(ownedPayload.evidence);
  Object.freeze(ownedPayload);
  return result;
}
