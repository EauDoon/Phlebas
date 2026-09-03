import type { Hex32 } from "../../src/lib/order-domain.ts";
import { appendSwapEvent, type SwapEventPayload, type SwapJournal } from "../../src/lib/swap-journal.ts";
import { replaySwapJournal } from "../../src/lib/swap-replay.ts";
import { swapStateRoot } from "../../src/lib/swap-root.ts";

function freezeTree(value: object): void {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object") freezeTree(child);
  }
  Object.freeze(value);
}

/** Key-independent ingestion only; source verification and durable commit remain caller responsibilities. */
export function ingestSwapEvidence(
  journal: SwapJournal,
  expectedJournalHead: Hex32,
  expectedStateRoot: Hex32,
  payload: Extract<SwapEventPayload, { kind: "observe-funding" | "observe-spend" }>,
): ReturnType<typeof appendSwapEvent> {
  if (journal.head !== expectedJournalHead) throw new Error("Observer ingestion journal head is stale or conflicting");
  const ownedJournal = structuredClone(journal);
  const state = replaySwapJournal(ownedJournal.initialState, ownedJournal);
  if (swapStateRoot(state) !== expectedStateRoot) throw new Error("Observer ingestion state root does not match replay");
  if (payload?.kind !== "observe-funding" && payload?.kind !== "observe-spend") {
    throw new TypeError("Observer ingestion accepts only funding or spend observations");
  }
  const result = appendSwapEvent(ownedJournal, state, structuredClone(payload));
  // Rehydrated history and duplicate receipts need the same protection as new payloads.
  freezeTree(result);
  return result;
}
