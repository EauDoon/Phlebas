import {
  createAtomicSwapPlan,
  type AtomicSwapParty,
  type AtomicSwapPlan,
  type AtomicSwapPolicy,
  type WalletSettlementAccounts,
} from "./atomic-swap-plan.ts";
import type { TypedOrderIntent } from "./eip712-order.ts";
import { normalizeHex32, type Hex32 } from "./order-domain.ts";
import { VENUE_CLOB, VENUE_SOLVER } from "./order-policy.ts";
import { planPriceTimeMatches, type SequencedOrder } from "./price-time.ts";
import {
  activeSolverLevels,
  hashSolverQuote,
  solverQuoteAsOrder,
  type AcceptedSolverQuote,
  type SolverMarginalLevel,
} from "./solver-quotes.ts";

export type RestingRouteOrder = Readonly<{
  sequenced: SequencedOrder;
  accounts: WalletSettlementAccounts;
}>;

export type RouteFill = Readonly<{
  venue: "order-book" | "solver";
  counterpartyOrderHash: Hex32;
  counterpartySequence: bigint;
  solverQuoteHash?: Hex32;
  executionPriceTicks: bigint;
  baseAmountAtoms: bigint;
  feeBps: bigint;
  grossQuoteAtoms: bigint;
  feeQuoteAtoms: bigint;
  quoteTransferAtoms: bigint;
  swapPlan: AtomicSwapPlan;
}>;

export type RouteCandidate = Readonly<{
  kind: "order-book" | "solver" | "combined";
  fills: readonly RouteFill[];
  filledBaseAtoms: bigint;
  remainingBaseAtoms: bigint;
  quoteTransferAtoms: bigint;
  complete: boolean;
}>;

export type RouteComparison = Readonly<{
  candidates: readonly RouteCandidate[];
  selected: RouteCandidate | null;
}>;

type Segment = Readonly<{
  venue: RouteFill["venue"];
  counterpartyOrderHash: Hex32;
  counterpartySequence: bigint;
  availableBaseAtoms: bigint;
  executionPriceTicks: bigint;
  feeBps: bigint;
  counterparty: AtomicSwapParty;
  solverQuote?: AcceptedSolverQuote;
}>;

type AllocatedSegment = Segment & Readonly<{ baseAmountAtoms: bigint }>;

function effectivePriceNumerator(side: TypedOrderIntent["side"], segment: Segment): bigint {
  return segment.executionPriceTicks * (side === 0 ? 10_000n + segment.feeBps : 10_000n - segment.feeBps);
}

function compareSegments(side: TypedOrderIntent["side"], left: Segment, right: Segment): number {
  const leftEffective = effectivePriceNumerator(side, left);
  const rightEffective = effectivePriceNumerator(side, right);
  if (leftEffective !== rightEffective) {
    if (side === 0) return leftEffective < rightEffective ? -1 : 1;
    return leftEffective > rightEffective ? -1 : 1;
  }
  if (left.venue !== right.venue) return left.venue === "order-book" ? -1 : 1;
  if (left.counterpartySequence !== right.counterpartySequence) {
    return left.counterpartySequence < right.counterpartySequence ? -1 : 1;
  }
  return left.counterpartyOrderHash.localeCompare(right.counterpartyOrderHash);
}

function priceWithinLimit(taker: TypedOrderIntent, priceTicks: bigint): boolean {
  return taker.side === 0 ? priceTicks <= taker.limitPriceTicks : priceTicks >= taker.limitPriceTicks;
}

function bookSegments(
  taker: SequencedOrder,
  restingOrders: readonly RestingRouteOrder[],
  nowSeconds: bigint,
): Segment[] {
  const active = restingOrders.filter((entry) => entry.sequenced.order.expiry > nowSeconds);
  const segmentTaker = taker.order.timeInForce === 2
    ? { ...taker, order: { ...taker.order, timeInForce: 1 as const } }
    : taker;
  const plan = planPriceTimeMatches(segmentTaker, active.map((entry) => entry.sequenced));
  const byHash = new Map(active.map((entry) => [normalizeHex32(entry.sequenced.orderHash, "Resting order hash"), entry]));
  return plan.fills.map((fill) => {
    const maker = byHash.get(fill.makerOrderHash);
    if (!maker) throw new Error("Price-time plan references an unknown resting order");
    return {
      venue: "order-book",
      counterpartyOrderHash: fill.makerOrderHash,
      counterpartySequence: fill.makerSequence,
      availableBaseAtoms: fill.baseAmountAtoms,
      executionPriceTicks: fill.executionPriceTicks,
      feeBps: 0n,
      counterparty: {
        orderHash: fill.makerOrderHash,
        order: maker.sequenced.order,
        accounts: maker.accounts,
      },
    };
  });
}

function solverSegments(
  taker: SequencedOrder,
  solverQuotes: readonly AcceptedSolverQuote[],
  nowSeconds: bigint,
): Segment[] {
  const segments: Segment[] = [];
  for (const accepted of solverQuotes) {
    const quote = accepted.quote;
    if (quote.expirySeconds <= nowSeconds || quote.side === taker.order.side
      || quote.feeBps !== 0n
      || quote.feeBps > taker.order.maximumFeeBps
      || normalizeHex32(quote.solverAccountId, "Solver account ID") === normalizeHex32(taker.order.makerAccountId, "Taker account ID")) {
      continue;
    }
    for (const level of activeSolverLevels(accepted, nowSeconds)) {
      if (!priceWithinLimit(taker.order, level.priceTicks)) continue;
      segments.push(segmentFromSolver(accepted, level));
    }
  }
  return segments;
}

function segmentFromSolver(accepted: AcceptedSolverQuote, level: SolverMarginalLevel): Segment {
  const order = solverQuoteAsOrder(accepted, level.priceTicks);
  return {
    venue: "solver",
    counterpartyOrderHash: accepted.quoteHash,
    counterpartySequence: accepted.acceptedSequence,
    availableBaseAtoms: level.availableBaseAtoms,
    executionPriceTicks: level.priceTicks,
    feeBps: level.feeBps,
    counterparty: {
      orderHash: accepted.quoteHash,
      order,
      accounts: {
        sourceAccount: accepted.quote.sourceAccount,
        recipientAccount: accepted.quote.recipientAccount,
      },
      authorizationKind: "solver-quote",
      verifiedAuthorizationHash: hashSolverQuote(accepted.quote),
    },
    solverQuote: accepted,
  };
}

function allocate(
  taker: SequencedOrder,
  segments: readonly Segment[],
  maximumFills: number,
  maximumSolverFills: number,
): AllocatedSegment[] {
  let excludedQuotes = new Set<string>();
  for (let attempt = 0; attempt <= segments.length; attempt += 1) {
    let remaining = taker.remainingBaseAtoms;
    let solverFills = 0;
    const allocated: AllocatedSegment[] = [];
    for (const segment of segments.filter((value) => !value.solverQuote || !excludedQuotes.has(value.solverQuote.quoteHash))
      .sort((left, right) => compareSegments(taker.order.side, left, right))) {
      if (remaining === 0n || allocated.length >= maximumFills) break;
      if (segment.venue === "solver" && solverFills >= maximumSolverFills) continue;
      const amount = segment.availableBaseAtoms < remaining ? segment.availableBaseAtoms : remaining;
      if (amount <= 0n) continue;
      allocated.push({ ...segment, baseAmountAtoms: amount });
      remaining -= amount;
      if (segment.venue === "solver") solverFills += 1;
    }
    const amountsByQuote = new Map<string, bigint>();
    for (const item of allocated) {
      if (item.solverQuote) amountsByQuote.set(
        item.solverQuote.quoteHash,
        (amountsByQuote.get(item.solverQuote.quoteHash) ?? 0n) + item.baseAmountAtoms,
      );
    }
    const offenders = [...amountsByQuote].filter(([quoteHash, amount]) => {
      const accepted = segments.find((segment) => segment.solverQuote?.quoteHash === quoteHash)?.solverQuote;
      if (!accepted) throw new Error("Allocated solver quote is missing");
      return amount < accepted.quote.minimumFillBaseAtoms && amount !== accepted.remainingCapacityBaseAtoms;
    }).map(([quoteHash]) => quoteHash);
    if (offenders.length === 0) return allocated;
    const nextExcluded = new Set(excludedQuotes);
    for (const quoteHash of offenders) nextExcluded.add(quoteHash);
    if (nextExcluded.size === excludedQuotes.size) throw new Error("Solver minimum-fill filtering did not converge");
    excludedQuotes = nextExcluded;
  }
  throw new Error("Solver minimum-fill filtering exceeded its bounded attempts");
}

function isUnmaterializableQuote(error: unknown): boolean {
  return error instanceof Error && /quote amount is dust|quote settlement amount is outside|quote rounding cannot preserve both signed limits/i.test(error.message);
}

function materializeCandidate(input: {
  kind: RouteCandidate["kind"];
  taker: SequencedOrder;
  takerAccounts: WalletSettlementAccounts;
  segments: readonly Segment[];
  acceptedAtSeconds: bigint;
  atomicSwapPolicy: AtomicSwapPolicy;
  maximumFills: number;
  maximumSolverFills: number;
}): RouteCandidate | null {
  const takerParty: AtomicSwapParty = {
    orderHash: normalizeHex32(input.taker.orderHash, "Taker order hash"),
    order: input.taker.order,
    accounts: input.takerAccounts,
  };
  let usableSegments = [...input.segments];
  for (let attempt = 0; attempt <= input.segments.length; attempt += 1) {
    let allocated = allocate(input.taker, usableSegments, input.maximumFills, input.maximumSolverFills);
    const filled = allocated.reduce((total, segment) => total + segment.baseAmountAtoms, 0n);
    if (input.taker.order.timeInForce === 2 && filled !== input.taker.remainingBaseAtoms) allocated = [];
    if (input.kind === "combined") {
      const venues = new Set(allocated.map((segment) => segment.venue));
      if (venues.size < 2) return null;
    }
    const fills: RouteFill[] = [];
    let rejectedSegment: Segment | undefined;
    for (const [fillIndex, segment] of allocated.entries()) {
      try {
        const swapPlan = createAtomicSwapPlan({
          venue: segment.venue,
          fillIndex,
          taker: takerParty,
          counterparty: segment.counterparty,
          acceptedAtSeconds: input.acceptedAtSeconds,
          executionPriceTicks: segment.executionPriceTicks,
          baseAmountAtoms: segment.baseAmountAtoms,
          feeBps: segment.feeBps,
          policy: input.atomicSwapPolicy,
        });
        const grossQuoteAtoms = BigInt(swapPlan.grossQuoteAtoms);
        const feeQuoteAtoms = BigInt(swapPlan.feeQuoteAtoms);
        const quoteTransferAtoms = BigInt(swapPlan.quoteTransferAtoms);
        fills.push({
          venue: segment.venue,
          counterpartyOrderHash: segment.counterpartyOrderHash,
          counterpartySequence: segment.counterpartySequence,
          ...(segment.solverQuote ? { solverQuoteHash: segment.solverQuote.quoteHash } : {}),
          executionPriceTicks: segment.executionPriceTicks,
          baseAmountAtoms: segment.baseAmountAtoms,
          feeBps: segment.feeBps,
          grossQuoteAtoms,
          feeQuoteAtoms,
          quoteTransferAtoms,
          swapPlan,
        });
      } catch (error: unknown) {
        if (!isUnmaterializableQuote(error)) throw error;
        rejectedSegment = segment;
        break;
      }
    }
    if (rejectedSegment) {
      usableSegments = usableSegments.filter((segment) => !(
        segment.venue === rejectedSegment.venue
        && segment.counterpartyOrderHash === rejectedSegment.counterpartyOrderHash
        && segment.counterpartySequence === rejectedSegment.counterpartySequence
        && segment.executionPriceTicks === rejectedSegment.executionPriceTicks
      ));
      continue;
    }
    const filledBaseAtoms = fills.reduce((total, fill) => total + fill.baseAmountAtoms, 0n);
    const remainingBaseAtoms = input.taker.remainingBaseAtoms - filledBaseAtoms;
    return {
      kind: input.kind,
      fills,
      filledBaseAtoms,
      remainingBaseAtoms,
      quoteTransferAtoms: fills.reduce((total, fill) => total + fill.quoteTransferAtoms, 0n),
      complete: remainingBaseAtoms === 0n,
    };
  }
  throw new Error("Quote materialization filtering exceeded its bounded attempts");
}

function candidateIsBetter(side: TypedOrderIntent["side"], left: RouteCandidate, right: RouteCandidate): boolean {
  if (left.filledBaseAtoms !== right.filledBaseAtoms) return left.filledBaseAtoms > right.filledBaseAtoms;
  if (left.quoteTransferAtoms !== right.quoteTransferAtoms) {
    return side === 0 ? left.quoteTransferAtoms < right.quoteTransferAtoms : left.quoteTransferAtoms > right.quoteTransferAtoms;
  }
  if (left.fills.length !== right.fills.length) return left.fills.length < right.fills.length;
  const rank = { "order-book": 0, solver: 1, combined: 2 } as const;
  return rank[left.kind] < rank[right.kind];
}

function assertLimits(maximumFills: number, maximumSolverFills: number): void {
  if (!Number.isSafeInteger(maximumFills) || maximumFills <= 0 || maximumFills > 128) {
    throw new RangeError("Maximum route fills must be an integer from 1 to 128");
  }
  if (!Number.isSafeInteger(maximumSolverFills) || maximumSolverFills <= 0 || maximumSolverFills > maximumFills) {
    throw new RangeError("Maximum solver fills must be positive and no larger than the route limit");
  }
}

export function compareExecutableRoutes(input: {
  taker: SequencedOrder;
  takerAccounts: WalletSettlementAccounts;
  restingOrders: readonly RestingRouteOrder[];
  solverQuotes: readonly AcceptedSolverQuote[];
  acceptedAtSeconds: bigint;
  atomicSwapPolicy: AtomicSwapPolicy;
  maximumFills?: number;
  maximumSolverFills?: number;
}): RouteComparison {
  const maximumFills = input.maximumFills ?? 16;
  const maximumSolverFills = input.maximumSolverFills ?? 8;
  assertLimits(maximumFills, maximumSolverFills);
  const candidates: RouteCandidate[] = [];
  const book = (input.taker.order.allowedVenues & VENUE_CLOB) !== 0
    ? bookSegments(input.taker, input.restingOrders, input.acceptedAtSeconds)
    : [];
  const solver = (input.taker.order.allowedVenues & VENUE_SOLVER) !== 0
    ? solverSegments(input.taker, input.solverQuotes, input.acceptedAtSeconds)
    : [];
  if (book.length > 0) {
    const candidate = materializeCandidate({ ...input, kind: "order-book", segments: book, maximumFills, maximumSolverFills });
    if (candidate) candidates.push(candidate);
  }
  if (solver.length > 0) {
    const candidate = materializeCandidate({ ...input, kind: "solver", segments: solver, maximumFills, maximumSolverFills });
    if (candidate) candidates.push(candidate);
  }
  if (book.length > 0 && solver.length > 0) {
    const candidate = materializeCandidate({ ...input, kind: "combined", segments: [...book, ...solver], maximumFills, maximumSolverFills });
    if (candidate) candidates.push(candidate);
  }
  const eligible = candidates.filter((candidate) => input.taker.order.timeInForce !== 2 || candidate.complete);
  let selected: RouteCandidate | null = null;
  for (const candidate of eligible) {
    if (candidate.filledBaseAtoms === 0n) continue;
    if (!selected || candidateIsBetter(input.taker.order.side, candidate, selected)) selected = candidate;
  }
  return { candidates, selected };
}
