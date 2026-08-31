import type { MatcherExecution, PersistentMatcherState } from "./persistent-matcher.ts";

export const MAX_FEED_PAGE_SIZE = 100;

export type MatcherBookLevel = Readonly<{
  priceTicks: bigint;
  baseAmountAtoms: bigint;
  orderCount: number;
  firstSequence: bigint;
}>;

function boundedLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_FEED_PAGE_SIZE) {
    throw new RangeError(`Feed limit must be from 1 to ${MAX_FEED_PAGE_SIZE}`);
  }
  return value;
}

function aggregateBookSide(state: PersistentMatcherState, side: 0 | 1, nowSeconds: bigint, limit: number): MatcherBookLevel[] {
  const levels = new Map<string, MatcherBookLevel>();
  for (const entry of Object.values(state.openOrders)) {
    const order = entry.sequenced.order;
    if (order.side !== side || order.expiry <= nowSeconds || entry.sequenced.remainingBaseAtoms <= 0n) continue;
    const key = order.limitPriceTicks.toString();
    const existing = levels.get(key);
    levels.set(key, existing
      ? {
          ...existing,
          baseAmountAtoms: existing.baseAmountAtoms + entry.sequenced.remainingBaseAtoms,
          orderCount: existing.orderCount + 1,
          firstSequence: existing.firstSequence < entry.sequenced.sequence ? existing.firstSequence : entry.sequenced.sequence,
        }
      : {
          priceTicks: order.limitPriceTicks,
          baseAmountAtoms: entry.sequenced.remainingBaseAtoms,
          orderCount: 1,
          firstSequence: entry.sequenced.sequence,
        });
  }
  return [...levels.values()].sort((left, right) => {
    if (left.priceTicks !== right.priceTicks) {
      const ascending = left.priceTicks < right.priceTicks ? -1 : 1;
      return side === 0 ? -ascending : ascending;
    }
    return left.firstSequence < right.firstSequence ? -1 : left.firstSequence > right.firstSequence ? 1 : 0;
  }).slice(0, boundedLimit(limit));
}

export function matcherBookFeed(state: PersistentMatcherState, nowSeconds: bigint, limit = 50) {
  if (typeof nowSeconds !== "bigint" || nowSeconds < 0n) throw new RangeError("Book feed time must be non-negative");
  const pair = state.configuration.atomicSwapPolicy.pair;
  return {
    sequence: state.sequence,
    pair,
    bids: aggregateBookSide(state, 0, nowSeconds, limit),
    asks: aggregateBookSide(state, 1, nowSeconds, limit),
  } as const;
}

export function matcherSolverQuoteFeed(state: PersistentMatcherState, nowSeconds: bigint, limit = 50) {
  boundedLimit(limit);
  if (typeof nowSeconds !== "bigint" || nowSeconds < 0n) throw new RangeError("Solver feed time must be non-negative");
  return Object.values(state.solverQuotes)
    .filter((accepted) => !state.cancelledSolverQuotes[accepted.quoteHash]
      && accepted.quote.expirySeconds > nowSeconds
      && accepted.remainingCapacityBaseAtoms > 0n)
    .sort((left, right) => left.acceptedSequence < right.acceptedSequence ? -1
      : left.acceptedSequence > right.acceptedSequence ? 1
        : left.quoteHash.localeCompare(right.quoteHash))
    .slice(0, limit)
    .map((accepted) => ({
      quoteHash: accepted.quoteHash,
      acceptedSequence: accepted.acceptedSequence,
      acceptedAtSeconds: accepted.acceptedAtSeconds,
      remainingCapacityBaseAtoms: accepted.remainingCapacityBaseAtoms,
      signature: accepted.signature,
      quote: accepted.quote,
    }));
}

export function matcherExecutionFeed(
  state: PersistentMatcherState,
  afterSequence: bigint,
  limit = 50,
): readonly MatcherExecution[] {
  boundedLimit(limit);
  if (typeof afterSequence !== "bigint" || afterSequence < 0n) throw new RangeError("Execution cursor must be non-negative");
  return state.executions.filter((execution) => execution.sequence > afterSequence).slice(0, limit);
}
