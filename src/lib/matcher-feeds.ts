import type { MatcherExecution, PersistentMatcherState } from "./persistent-matcher.ts";
import type { RouteCandidate, RouteFill } from "./matcher-routing.ts";
import type { SolverPricePolicy, SolverQuote } from "./solver-quotes.ts";

export const MAX_FEED_PAGE_SIZE = 100;

export type MatcherBookLevel = Readonly<{
  priceTicks: bigint;
  baseAmountAtoms: bigint;
  orderCount: number;
  firstSequence: bigint;
}>;

export type MatcherPublicSolverQuoteTerms = Readonly<Pick<SolverQuote,
  "version"
  | "matcherDomainHash"
  | "baseNetwork"
  | "baseAsset"
  | "quoteNetwork"
  | "quoteAsset"
  | "side"
  | "capacityBaseAtoms"
  | "minimumFillBaseAtoms"
  | "pricePolicy"
  | "maximumSlippageBps"
  | "feeBps"
  | "nonce"
  | "expirySeconds"
  | "settlementProtocolVersion"
>>;

export type MatcherSolverQuoteFeedItem = Readonly<{
  quoteHash: string;
  acceptedSequence: bigint;
  acceptedAtSeconds: bigint;
  remainingCapacityBaseAtoms: bigint;
  quote: MatcherPublicSolverQuoteTerms;
}>;

export type MatcherExecutionFeedItem = Readonly<{
  sequence: bigint;
  takerOrderHash: string;
  route: Readonly<{
    kind: RouteCandidate["kind"];
    fills: readonly Readonly<{
      venue: RouteFill["venue"];
      counterpartyOrderHash: string;
      counterpartySequence: bigint;
      solverQuoteHash?: string;
      executionPriceTicks: bigint;
      baseAmountAtoms: bigint;
      grossQuoteAtoms: bigint;
      feeQuoteAtoms: bigint;
      quoteTransferAtoms: bigint;
    }>[];
    filledBaseAtoms: bigint;
    remainingBaseAtoms: bigint;
    quoteTransferAtoms: bigint;
    complete: boolean;
  }> | null;
}>;

export type MatcherSolverQuoteFeedPage = Readonly<{
  quotes: readonly MatcherSolverQuoteFeedItem[];
  after: bigint;
  nextAfter: bigint;
  hasMore: boolean;
}>;

export type MatcherExecutionFeedPage = Readonly<{
  executions: readonly MatcherExecutionFeedItem[];
  after: bigint;
  nextAfter: bigint;
  hasMore: boolean;
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
  return matcherSolverQuoteFeedPage(state, nowSeconds, limit).quotes;
}

function publicPricePolicy(policy: SolverPricePolicy): SolverPricePolicy {
  if (policy.kind === "fixed") return { kind: "fixed", priceTicks: policy.priceTicks };
  return {
    kind: "curve",
    levels: policy.levels.map((level) => ({
      cumulativeBaseAtoms: level.cumulativeBaseAtoms,
      priceTicks: level.priceTicks,
    })),
  };
}

function publicSolverQuote(accepted: PersistentMatcherState["solverQuotes"][string]): MatcherSolverQuoteFeedItem {
  const quote = accepted.quote;
  return {
    quoteHash: accepted.quoteHash,
    acceptedSequence: accepted.acceptedSequence,
    acceptedAtSeconds: accepted.acceptedAtSeconds,
    remainingCapacityBaseAtoms: accepted.remainingCapacityBaseAtoms,
    quote: {
      version: quote.version,
      matcherDomainHash: quote.matcherDomainHash,
      baseNetwork: quote.baseNetwork,
      baseAsset: quote.baseAsset,
      quoteNetwork: quote.quoteNetwork,
      quoteAsset: quote.quoteAsset,
      side: quote.side,
      capacityBaseAtoms: quote.capacityBaseAtoms,
      minimumFillBaseAtoms: quote.minimumFillBaseAtoms,
      pricePolicy: publicPricePolicy(quote.pricePolicy),
      maximumSlippageBps: quote.maximumSlippageBps,
      feeBps: quote.feeBps,
      nonce: quote.nonce,
      expirySeconds: quote.expirySeconds,
      settlementProtocolVersion: quote.settlementProtocolVersion,
    },
  };
}

export function matcherSolverQuoteFeedPage(
  state: PersistentMatcherState,
  nowSeconds: bigint,
  limit = 50,
  afterSequence = 0n,
): MatcherSolverQuoteFeedPage {
  boundedLimit(limit);
  if (typeof nowSeconds !== "bigint" || nowSeconds < 0n) throw new RangeError("Solver feed time must be non-negative");
  if (typeof afterSequence !== "bigint" || afterSequence < 0n) throw new RangeError("Solver feed cursor must be non-negative");
  const matching = Object.values(state.solverQuotes)
    .filter((accepted) => !state.cancelledSolverQuotes[accepted.quoteHash]
      && accepted.quote.expirySeconds > nowSeconds
      && accepted.remainingCapacityBaseAtoms > 0n
      && accepted.acceptedSequence > afterSequence)
    .sort((left, right) => left.acceptedSequence < right.acceptedSequence ? -1
      : left.acceptedSequence > right.acceptedSequence ? 1
        : left.quoteHash < right.quoteHash ? -1 : left.quoteHash > right.quoteHash ? 1 : 0);
  const quotes = matching.slice(0, limit).map(publicSolverQuote);
  return {
    quotes,
    after: afterSequence,
    nextAfter: quotes.at(-1)?.acceptedSequence ?? afterSequence,
    hasMore: matching.length > quotes.length,
  };
}

function publicExecution(execution: MatcherExecution): MatcherExecutionFeedItem {
  if (!execution.route) return {
    sequence: execution.sequence,
    takerOrderHash: execution.takerOrderHash,
    route: null,
  };
  return {
    sequence: execution.sequence,
    takerOrderHash: execution.takerOrderHash,
    route: {
      kind: execution.route.kind,
      fills: execution.route.fills.map((fill) => ({
        venue: fill.venue,
        counterpartyOrderHash: fill.counterpartyOrderHash,
        counterpartySequence: fill.counterpartySequence,
        ...(fill.solverQuoteHash ? { solverQuoteHash: fill.solverQuoteHash } : {}),
        executionPriceTicks: fill.executionPriceTicks,
        baseAmountAtoms: fill.baseAmountAtoms,
        grossQuoteAtoms: fill.grossQuoteAtoms,
        feeQuoteAtoms: fill.feeQuoteAtoms,
        quoteTransferAtoms: fill.quoteTransferAtoms,
      })),
      filledBaseAtoms: execution.route.filledBaseAtoms,
      remainingBaseAtoms: execution.route.remainingBaseAtoms,
      quoteTransferAtoms: execution.route.quoteTransferAtoms,
      complete: execution.route.complete,
    },
  };
}

export function matcherExecutionFeed(
  state: PersistentMatcherState,
  afterSequence: bigint,
  limit = 50,
): readonly MatcherExecutionFeedItem[] {
  return matcherExecutionFeedPage(state, afterSequence, limit).executions;
}

export function matcherExecutionFeedPage(
  state: PersistentMatcherState,
  afterSequence: bigint,
  limit = 50,
): MatcherExecutionFeedPage {
  boundedLimit(limit);
  if (typeof afterSequence !== "bigint" || afterSequence < 0n) throw new RangeError("Execution cursor must be non-negative");
  const matching = state.executions
    .filter((execution) => execution.sequence > afterSequence)
    .sort((left, right) => left.sequence < right.sequence ? -1 : left.sequence > right.sequence ? 1 : 0);
  const executions = matching.slice(0, limit).map(publicExecution);
  return {
    executions,
    after: afterSequence,
    nextAfter: executions.at(-1)?.sequence ?? afterSequence,
    hasMore: matching.length > executions.length,
  };
}
