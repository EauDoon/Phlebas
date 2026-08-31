// Poller loop for the atomic-swap observer. The poller fetches
// events from the EVM and ZEC observers, reduces them to
// transitions, applies them to the coordinator, persists the
// snapshot, and runs the watchtower. The poller is deterministic
// for a fixed clock and event source: same inputs always yield
// the same coordinator state and the same alert set.

import {
  applyTransition,
  type CoordinatorState,
} from "../../src/lib/atomic-coordinator.ts";
import { reduceEVMEvents } from "../../src/lib/evm-event-reducer.ts";
import { reduceZcashEvents } from "../../src/lib/zcash-event-reducer.ts";
import { pollOnce, type EVMEvent } from "../../src/lib/evm-observer.ts";
import { pollZcashOnce, type ZcashOutpointEvent } from "../../src/lib/zcash-observer.ts";
import { detectAlerts, type WatchtowerAlert } from "../../src/lib/watchtower.ts";
import { readSnapshot, writeSnapshot } from "../../src/lib/coordinator-persistence.ts";
import type { AtomicSwapObserverServiceConfig } from "./types.ts";

export type PollOutcome = Readonly<{
  state: CoordinatorState;
  alerts: ReadonlyArray<WatchtowerAlert>;
  evmEvents: ReadonlyArray<EVMEvent>;
  zecEvents: ReadonlyArray<ZcashOutpointEvent>;
}>;

export async function loadInitialState(snapshotPath: string): Promise<CoordinatorState | null> {
  const restored = await readSnapshot({ path: snapshotPath });
  if (restored === null) return null;
  return restored;
}

export async function pollOnceInto(
  state: CoordinatorState,
  config: AtomicSwapObserverServiceConfig,
  nowSeconds: bigint,
): Promise<PollOutcome> {
  const evmEvents = await pollOnce(config.evm);
  const zecEvents = await pollZcashOnce(config.zcash);
  const evmTransitions = reduceEVMEvents(evmEvents, { blockTimestamp: () => nowSeconds });
  const zecTransitions = reduceZcashEvents(zecEvents, { blockTimestamp: () => nowSeconds, fillIdByOutpoint: config.fillIdByOutpoint });
  let next = state;
  for (const t of evmTransitions) {
    next = applyTransition(next, t.fillId, t.transition, t.observedAt);
  }
  for (const t of zecTransitions) {
    next = applyTransition(next, t.fillId, t.transition, t.observedAt);
  }
  await writeSnapshot({ path: config.snapshotPath }, next);
  const alerts = detectAlerts(next, nowSeconds, config.watchtower);
  return { state: next, alerts, evmEvents, zecEvents };
}
