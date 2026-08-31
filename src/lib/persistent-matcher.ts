import { assertSettlementAccounts, type WalletSettlementAccounts, type AtomicSwapPolicy } from "./atomic-swap-plan.ts";
import { hashOrderDomain, hashTypedOrder, type OrderDomain, type TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import {
  verifyMatcherControl,
  verifySignedOrderIntent,
  type MatcherSignatureVerifier,
} from "./matcher-auth.ts";
import { compareExecutableRoutes, type RestingRouteOrder, type RouteCandidate } from "./matcher-routing.ts";
import {
  UINT64_MAX,
  adapterIdentifier,
  assetIdentifier,
  chainIdentifier,
  normalizeHex32,
  type Hex32,
} from "./order-domain.ts";
import { activeAccountEpoch, orderActivity } from "./order-lifecycle.ts";
import { VENUE_CLOB } from "./order-policy.ts";
import {
  acceptOrderIntent,
  applyOrderReferenceEvent,
  createOrderReference,
  orderReferenceSnapshot,
  type OrderReferenceState,
} from "./order-reference.ts";
import type { SequencedOrder } from "./price-time.ts";
import {
  acceptSolverQuote,
  consumeSolverCapacity,
  hashSolverQuote,
  type AcceptedSolverQuote,
  type SolverQuote,
  type SolverQuotePolicy,
} from "./solver-quotes.ts";

export const PERSISTENT_MATCHER_VERSION = 1;

export type PersistentMatcherLimits = Readonly<{
  minimumBaseAmountAtoms: bigint;
  maximumBaseAmountAtoms: bigint;
  maximumAcceptedOrders: number;
  maximumOpenOrders: number;
  maximumOpenOrdersPerAccount: number;
  maximumSolverQuotes: number;
  maximumRouteFills: number;
  maximumSolverFills: number;
}>;

export type PersistentMatcherConfiguration = Readonly<{
  domain: OrderDomain;
  atomicSwapPolicy: AtomicSwapPolicy;
  solverQuotePolicy: SolverQuotePolicy;
  maximumOrderLifetimeSeconds: bigint;
  limits: PersistentMatcherLimits;
}>;

export type SignedOrderSubmission = Readonly<{
  order: TypedOrderIntent;
  signature: string;
  accounts: WalletSettlementAccounts;
}>;

export type PersistentMatcherEvent = Readonly<{
  version: typeof PERSISTENT_MATCHER_VERSION;
  requestId: string;
  occurredAtSeconds: bigint;
}> & (
  | Readonly<{ kind: "accept-order"; submission: SignedOrderSubmission }>
  | Readonly<{ kind: "cancel-order"; orderHash: Hex32; signature: string }>
  | Readonly<{
    kind: "advance-epoch";
    makerAccountId: Hex32;
    nextEpoch: bigint;
    authorizedSignerId: Hex32;
    signature: string;
  }>
  | Readonly<{ kind: "accept-solver-quote"; quote: SolverQuote; signature: string }>
  | Readonly<{ kind: "cancel-solver-quote"; quoteHash: Hex32; signature: string }>
);

export type MatcherMutationReceipt = Readonly<{
  version: typeof PERSISTENT_MATCHER_VERSION;
  sequence: bigint;
  requestId: string;
  commandHash: Hex32;
  kind: PersistentMatcherEvent["kind"];
  occurredAtSeconds: bigint;
  status:
    | "open"
    | "filled"
    | "partially-filled"
    | "ioc-remainder-cancelled"
    | "fok-rejected"
    | "unfilled"
    | "cancelled"
    | "epoch-advanced"
    | "solver-quote-open"
    | "solver-quote-cancelled";
  subjectHash?: Hex32;
  routeKind?: RouteCandidate["kind"];
  remainingBaseAtoms?: bigint;
  swapPlanIds: readonly Hex32[];
}>;

export type MatcherExecution = Readonly<{
  sequence: bigint;
  takerOrderHash: Hex32;
  route: RouteCandidate | null;
}>;

export type PersistentMatcherState = Readonly<{
  version: typeof PERSISTENT_MATCHER_VERSION;
  configuration: PersistentMatcherConfiguration;
  sequence: bigint;
  lastEventAtSeconds: bigint;
  orderReference: OrderReferenceState;
  orderAccounts: Readonly<Record<string, WalletSettlementAccounts>>;
  openOrders: Readonly<Record<string, RestingRouteOrder>>;
  solverQuotes: Readonly<Record<string, AcceptedSolverQuote>>;
  cancelledSolverQuotes: Readonly<Record<string, true>>;
  accountSigners: Readonly<Record<string, Hex32>>;
  executions: readonly MatcherExecution[];
  receipts: readonly MatcherMutationReceipt[];
  requestIndex: Readonly<Record<string, MatcherMutationReceipt>>;
}>;

function assertSafeCount(value: number, label: string, maximum = 1_000_000): void {
  if (!Number.isSafeInteger(value) || value <= 0 || value > maximum) {
    throw new RangeError(`${label} must be a positive bounded integer`);
  }
}

function assertConfiguration(configuration: PersistentMatcherConfiguration): void {
  if (typeof configuration.maximumOrderLifetimeSeconds !== "bigint"
    || configuration.maximumOrderLifetimeSeconds <= 0n || configuration.maximumOrderLifetimeSeconds > UINT64_MAX) {
    throw new RangeError("Maximum order lifetime must be a positive uint64");
  }
  const limits = configuration.limits;
  if (typeof limits.minimumBaseAmountAtoms !== "bigint" || limits.minimumBaseAmountAtoms <= 0n) {
    throw new RangeError("Minimum base amount must be positive");
  }
  if (typeof limits.maximumBaseAmountAtoms !== "bigint" || limits.maximumBaseAmountAtoms < limits.minimumBaseAmountAtoms) {
    throw new RangeError("Maximum base amount must not be below the minimum");
  }
  assertSafeCount(limits.maximumAcceptedOrders, "Maximum accepted orders");
  assertSafeCount(limits.maximumOpenOrders, "Maximum open orders");
  assertSafeCount(limits.maximumOpenOrdersPerAccount, "Maximum open orders per account");
  assertSafeCount(limits.maximumSolverQuotes, "Maximum solver quotes");
  assertSafeCount(limits.maximumRouteFills, "Maximum route fills", 128);
  assertSafeCount(limits.maximumSolverFills, "Maximum solver fills", 128);
  if (limits.maximumOpenOrdersPerAccount > limits.maximumOpenOrders) {
    throw new RangeError("Per-account open-order limit exceeds the global limit");
  }
  if (limits.maximumSolverFills > limits.maximumRouteFills) {
    throw new RangeError("Solver fill limit exceeds the route fill limit");
  }
  const pair = configuration.atomicSwapPolicy.pair;
  const adapter = adapterIdentifier(configuration.atomicSwapPolicy.settlementProtocolVersion);
  if (configuration.solverQuotePolicy.baseNetwork !== pair.base.network
    || configuration.solverQuotePolicy.baseAsset !== pair.base.asset
    || configuration.solverQuotePolicy.quoteNetwork !== pair.quote.network
    || configuration.solverQuotePolicy.quoteAsset !== pair.quote.asset
    || configuration.solverQuotePolicy.settlementProtocolVersion !== configuration.atomicSwapPolicy.settlementProtocolVersion
    || adapter !== adapterIdentifier(configuration.solverQuotePolicy.settlementProtocolVersion)) {
    throw new Error("Matcher atomic-swap and solver policies do not bind the same pair and protocol");
  }
  if (hashOrderDomain(configuration.atomicSwapPolicy.orderDomain) !== hashOrderDomain(configuration.domain)) {
    throw new Error("Atomic-swap policy does not bind the matcher order domain");
  }
  if (normalizeHex32(configuration.solverQuotePolicy.matcherDomainHash, "Solver matcher domain hash") !== hashOrderDomain(configuration.domain)) {
    throw new Error("Solver quote policy does not bind the matcher order domain");
  }
}

export function createPersistentMatcher(configuration: PersistentMatcherConfiguration): PersistentMatcherState {
  assertConfiguration(configuration);
  const pair = configuration.atomicSwapPolicy.pair;
  const settlementAdapterId = adapterIdentifier(configuration.atomicSwapPolicy.settlementProtocolVersion);
  return {
    version: PERSISTENT_MATCHER_VERSION,
    configuration,
    sequence: 0n,
    lastEventAtSeconds: 0n,
    orderReference: createOrderReference({
      domain: configuration.domain,
      pair: {
        baseChainId: chainIdentifier(pair.base.network),
        baseAssetId: assetIdentifier(pair.base.asset),
        quoteChainId: chainIdentifier(pair.quote.network),
        quoteAssetId: assetIdentifier(pair.quote.asset),
      },
      settlementAdapterId,
      maximumLifetimeSeconds: configuration.maximumOrderLifetimeSeconds,
      requireClob: false,
    }),
    orderAccounts: {},
    openOrders: {},
    solverQuotes: {},
    cancelledSolverQuotes: {},
    accountSigners: {},
    executions: [],
    receipts: [],
    requestIndex: {},
  };
}

function canonicalRequestId(value: string): string {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) throw new TypeError("Request ID is invalid");
  return value;
}

export function matcherCommandHash(configuration: PersistentMatcherConfiguration, event: PersistentMatcherEvent): Hex32 {
  const fields = [
    "PhlebasMatcherCommand",
    `version=${event.version}`,
    `configuration=${matcherConfigurationHash(configuration)}`,
    `requestId=${canonicalRequestId(event.requestId)}`,
    `occurredAtSeconds=${event.occurredAtSeconds}`,
    `kind=${event.kind}`,
  ];
  if (event.kind === "accept-order") {
    fields.push(
      `orderHash=${hashTypedOrder(configuration.domain, event.submission.order)}`,
      `signature=${event.submission.signature}`,
      `sourceAccount=${event.submission.accounts.sourceAccount}`,
      `recipientAccount=${event.submission.accounts.recipientAccount}`,
    );
  } else if (event.kind === "cancel-order") {
    fields.push(`orderHash=${normalizeHex32(event.orderHash, "Cancelled order hash")}`, `signature=${event.signature}`);
  } else if (event.kind === "advance-epoch") {
    fields.push(
      `makerAccountId=${normalizeHex32(event.makerAccountId, "Maker account ID")}`,
      `nextEpoch=${event.nextEpoch}`,
      `authorizedSignerId=${normalizeHex32(event.authorizedSignerId, "Authorized signer ID")}`,
      `signature=${event.signature}`,
    );
  } else if (event.kind === "accept-solver-quote") {
    fields.push(`quoteHash=${hashSolverQuote(event.quote)}`, `signature=${event.signature}`);
  } else {
    fields.push(`quoteHash=${normalizeHex32(event.quoteHash, "Solver quote hash")}`, `signature=${event.signature}`);
  }
  return keccak256Text(fields.join("\n"));
}

export function findRequestReceipt(
  state: PersistentMatcherState,
  requestId: string,
  commandHash?: Hex32,
): MatcherMutationReceipt | null {
  const receipt = state.requestIndex[canonicalRequestId(requestId)] ?? null;
  if (receipt && commandHash && receipt.commandHash !== normalizeHex32(commandHash, "Command hash")) {
    throw new Error("Request ID was already used for a different command");
  }
  return receipt;
}

function withReferenceRemaining(reference: OrderReferenceState, orderHash: Hex32, remainingBaseAtoms: bigint): OrderReferenceState {
  const accepted = reference.acceptedOrders[orderHash];
  if (!accepted) throw new Error("Accepted order is missing from reference state");
  return {
    ...reference,
    acceptedOrders: {
      ...reference.acceptedOrders,
      [orderHash]: { ...accepted, remainingBaseAtoms },
    },
  };
}

function activeRestingOrderEntries(state: PersistentMatcherState, nowSeconds: bigint): [string, RestingRouteOrder][] {
  return Object.entries(state.openOrders).filter(([, entry]) => orderActivity(
    state.orderReference.lifecycle,
    entry.sequenced.orderHash,
    entry.sequenced.order,
    nowSeconds,
  ).active);
}

function activeSolverQuotes(state: PersistentMatcherState): AcceptedSolverQuote[] {
  return Object.values(state.solverQuotes).filter((quote) => !state.cancelledSolverQuotes[quote.quoteHash]);
}

function bindAccountSigner(state: PersistentMatcherState, accountId: Hex32, signerId: Hex32): Readonly<Record<string, Hex32>> {
  const account = normalizeHex32(accountId, "Account ID");
  const signer = normalizeHex32(signerId, "Authorized signer ID");
  const existing = state.accountSigners[account];
  if (existing && existing !== signer) throw new Error("Account signer rotation is not supported by this matcher version");
  return existing ? state.accountSigners : { ...state.accountSigners, [account]: signer };
}

function applyOrderAcceptance(
  state: PersistentMatcherState,
  event: Extract<PersistentMatcherEvent, { kind: "accept-order" }>,
  sequence: bigint,
  verifier: MatcherSignatureVerifier,
): { state: PersistentMatcherState; receipt: Omit<MatcherMutationReceipt, "commandHash" | "requestId" | "sequence" | "occurredAtSeconds" | "version" | "kind"> } {
  const order = event.submission.order;
  const limits = state.configuration.limits;
  if (order.baseAmountAtoms < limits.minimumBaseAmountAtoms || order.baseAmountAtoms > limits.maximumBaseAmountAtoms) {
    throw new RangeError("Order base amount is outside matcher limits");
  }
  if (Object.keys(state.orderReference.acceptedOrders).length >= limits.maximumAcceptedOrders) {
    throw new RangeError("Accepted-order limit reached");
  }
  verifySignedOrderIntent(verifier, state.configuration.domain, order, event.submission.signature);
  assertSettlementAccounts(order, event.submission.accounts);
  const accountSigners = bindAccountSigner(state, order.makerAccountId, order.authorizedSignerId);
  const accepted = acceptOrderIntent(state.orderReference, order, event.occurredAtSeconds);
  const orderHash = accepted.accepted.orderHash;
  const taker: SequencedOrder = { ...accepted.accepted, sequence };
  const activeRestingEntries = activeRestingOrderEntries(state, event.occurredAtSeconds);
  const comparison = compareExecutableRoutes({
    taker,
    takerAccounts: event.submission.accounts,
    restingOrders: activeRestingEntries.map(([, entry]) => entry),
    solverQuotes: activeSolverQuotes(state),
    acceptedAtSeconds: event.occurredAtSeconds,
    atomicSwapPolicy: state.configuration.atomicSwapPolicy,
    maximumFills: limits.maximumRouteFills,
    maximumSolverFills: limits.maximumSolverFills,
  });
  const selected = comparison.selected;
  let reference = accepted.state;
  const openOrders = Object.fromEntries(activeRestingEntries);
  const solverQuotes = { ...state.solverQuotes };
  if (selected) {
    for (const fill of selected.fills) {
      if (fill.venue === "order-book") {
        const maker = openOrders[fill.counterpartyOrderHash];
        if (!maker) throw new Error("Selected route references a missing open order");
        const nextRemaining = maker.sequenced.remainingBaseAtoms - fill.baseAmountAtoms;
        if (nextRemaining < 0n) throw new Error("Selected route overfills an open order");
        reference = withReferenceRemaining(reference, fill.counterpartyOrderHash, nextRemaining);
        if (nextRemaining === 0n) delete openOrders[fill.counterpartyOrderHash];
        else openOrders[fill.counterpartyOrderHash] = {
          ...maker,
          sequenced: { ...maker.sequenced, remainingBaseAtoms: nextRemaining },
        };
      }
    }
    const solverConsumption = new Map<string, bigint>();
    for (const fill of selected.fills) {
      if (fill.solverQuoteHash) solverConsumption.set(
        fill.solverQuoteHash,
        (solverConsumption.get(fill.solverQuoteHash) ?? 0n) + fill.baseAmountAtoms,
      );
    }
    for (const [quoteHash, amount] of solverConsumption) {
      const quote = solverQuotes[quoteHash];
      if (!quote) throw new Error("Selected route references a missing solver quote");
      solverQuotes[quoteHash] = consumeSolverCapacity(quote, amount);
    }
  }
  const remaining = selected?.remainingBaseAtoms ?? order.baseAmountAtoms;
  reference = withReferenceRemaining(reference, orderHash, remaining);
  const shouldRest = order.timeInForce === 0 && remaining > 0n && (order.allowedVenues & VENUE_CLOB) !== 0;
  if (shouldRest) {
    const accountOpenCount = Object.values(openOrders)
      .filter((entry) => entry.sequenced.order.makerAccountId === order.makerAccountId).length;
    if (Object.keys(openOrders).length >= limits.maximumOpenOrders) throw new RangeError("Open-order limit reached");
    if (accountOpenCount >= limits.maximumOpenOrdersPerAccount) throw new RangeError("Per-account open-order limit reached");
    openOrders[orderHash] = { sequenced: { ...taker, remainingBaseAtoms: remaining }, accounts: { ...event.submission.accounts } };
  }
  const status: MatcherMutationReceipt["status"] = remaining === 0n
    ? "filled"
    : order.timeInForce === 2
      ? "fok-rejected"
      : order.timeInForce === 1
        ? selected ? "ioc-remainder-cancelled" : "unfilled"
        : shouldRest
          ? selected ? "partially-filled" : "open"
          : selected ? "partially-filled" : "unfilled";
  const nextState: PersistentMatcherState = {
    ...state,
    orderReference: reference,
    orderAccounts: { ...state.orderAccounts, [orderHash]: { ...event.submission.accounts } },
    openOrders,
    solverQuotes,
    accountSigners,
    executions: [...state.executions, { sequence, takerOrderHash: orderHash, route: selected }],
  };
  return {
    state: nextState,
    receipt: {
      status,
      subjectHash: orderHash,
      ...(selected ? { routeKind: selected.kind } : {}),
      remainingBaseAtoms: remaining,
      swapPlanIds: selected?.fills.map((fill) => fill.swapPlan.planId) ?? [],
    },
  };
}

function applyOrderCancellation(
  state: PersistentMatcherState,
  event: Extract<PersistentMatcherEvent, { kind: "cancel-order" }>,
  verifier: MatcherSignatureVerifier,
) {
  const orderHash = normalizeHex32(event.orderHash, "Cancelled order hash");
  const accepted = state.orderReference.acceptedOrders[orderHash];
  if (!accepted) throw new Error("Cancelled order is unknown");
  const authorization = {
    kind: "cancel-order" as const,
    orderHash,
    makerAccountId: accepted.order.makerAccountId,
    accountEpoch: accepted.order.accountEpoch,
    nonce: accepted.order.nonce,
    authorizedSignerId: accepted.order.authorizedSignerId,
  };
  verifyMatcherControl(verifier, state.configuration.domain, authorization, event.signature);
  const reference = applyOrderReferenceEvent(state.orderReference, {
    kind: "cancel-nonce",
    accountId: accepted.order.makerAccountId,
    accountEpoch: accepted.order.accountEpoch,
    nonce: accepted.order.nonce,
  });
  const openOrders = { ...state.openOrders };
  delete openOrders[orderHash];
  return { state: { ...state, orderReference: reference, openOrders }, subjectHash: orderHash };
}

function applyEpochAdvance(
  state: PersistentMatcherState,
  event: Extract<PersistentMatcherEvent, { kind: "advance-epoch" }>,
  verifier: MatcherSignatureVerifier,
) {
  const makerAccountId = normalizeHex32(event.makerAccountId, "Maker account ID");
  const authorizedSignerId = normalizeHex32(event.authorizedSignerId, "Authorized signer ID");
  if (state.accountSigners[makerAccountId] !== authorizedSignerId) throw new Error("Epoch signer is not bound to the maker account");
  const currentEpoch = activeAccountEpoch(state.orderReference.lifecycle, makerAccountId);
  verifyMatcherControl(verifier, state.configuration.domain, {
    kind: "advance-epoch",
    makerAccountId,
    currentEpoch,
    nextEpoch: event.nextEpoch,
    authorizedSignerId,
  }, event.signature);
  const reference = applyOrderReferenceEvent(state.orderReference, { kind: "advance-epoch", accountId: makerAccountId, nextEpoch: event.nextEpoch });
  const openOrders = Object.fromEntries(Object.entries(state.openOrders).filter(([, entry]) => entry.sequenced.order.makerAccountId !== makerAccountId));
  return { state: { ...state, orderReference: reference, openOrders }, subjectHash: makerAccountId };
}

function applySolverAcceptance(
  state: PersistentMatcherState,
  event: Extract<PersistentMatcherEvent, { kind: "accept-solver-quote" }>,
  sequence: bigint,
  verifier: MatcherSignatureVerifier,
) {
  if (Object.keys(state.solverQuotes).length >= state.configuration.limits.maximumSolverQuotes) {
    throw new RangeError("Solver quote limit reached");
  }
  const accepted = acceptSolverQuote(
    event.quote,
    event.signature,
    sequence,
    event.occurredAtSeconds,
    state.configuration.solverQuotePolicy,
    verifier,
  );
  if (state.solverQuotes[accepted.quoteHash]) throw new Error("Solver quote replayed");
  const accountSigners = bindAccountSigner(state, event.quote.solverAccountId, event.quote.authorizedSignerId);
  return {
    state: { ...state, solverQuotes: { ...state.solverQuotes, [accepted.quoteHash]: accepted }, accountSigners },
    subjectHash: accepted.quoteHash,
  };
}

function applySolverCancellation(
  state: PersistentMatcherState,
  event: Extract<PersistentMatcherEvent, { kind: "cancel-solver-quote" }>,
  verifier: MatcherSignatureVerifier,
) {
  const quoteHash = normalizeHex32(event.quoteHash, "Solver quote hash");
  const accepted = state.solverQuotes[quoteHash];
  if (!accepted) throw new Error("Solver quote is unknown");
  verifyMatcherControl(verifier, state.configuration.domain, {
    kind: "cancel-solver-quote",
    quoteHash,
    solverAccountId: accepted.quote.solverAccountId,
    authorizedSignerId: accepted.quote.authorizedSignerId,
  }, event.signature);
  if (state.cancelledSolverQuotes[quoteHash]) throw new Error("Solver quote is already cancelled");
  return {
    state: { ...state, cancelledSolverQuotes: { ...state.cancelledSolverQuotes, [quoteHash]: true as const } },
    subjectHash: quoteHash,
  };
}

export function applyPersistentMatcherEvent(
  state: PersistentMatcherState,
  event: PersistentMatcherEvent,
  sequence: bigint,
  verifier: MatcherSignatureVerifier,
): { state: PersistentMatcherState; receipt: MatcherMutationReceipt } {
  if (event.version !== PERSISTENT_MATCHER_VERSION) throw new Error("Matcher event version is unsupported");
  if (sequence !== state.sequence + 1n || sequence <= 0n || sequence > UINT64_MAX) throw new Error("Matcher event sequence is not contiguous");
  const requestId = canonicalRequestId(event.requestId);
  if (state.requestIndex[requestId]) throw new Error("Request ID already has a matcher receipt");
  if (typeof event.occurredAtSeconds !== "bigint" || event.occurredAtSeconds < state.lastEventAtSeconds || event.occurredAtSeconds > UINT64_MAX) {
    throw new RangeError("Matcher event time is invalid or moved backward");
  }
  const commandHash = matcherCommandHash(state.configuration, event);
  let changed: PersistentMatcherState;
  let details: Omit<MatcherMutationReceipt, "version" | "sequence" | "requestId" | "commandHash" | "kind" | "occurredAtSeconds">;
  if (event.kind === "accept-order") {
    const result = applyOrderAcceptance(state, event, sequence, verifier);
    changed = result.state;
    details = result.receipt;
  } else if (event.kind === "cancel-order") {
    const result = applyOrderCancellation(state, event, verifier);
    changed = result.state;
    details = { status: "cancelled", subjectHash: result.subjectHash, swapPlanIds: [] };
  } else if (event.kind === "advance-epoch") {
    const result = applyEpochAdvance(state, event, verifier);
    changed = result.state;
    details = { status: "epoch-advanced", subjectHash: result.subjectHash, swapPlanIds: [] };
  } else if (event.kind === "accept-solver-quote") {
    const result = applySolverAcceptance(state, event, sequence, verifier);
    changed = result.state;
    details = { status: "solver-quote-open", subjectHash: result.subjectHash, swapPlanIds: [] };
  } else {
    const result = applySolverCancellation(state, event, verifier);
    changed = result.state;
    details = { status: "solver-quote-cancelled", subjectHash: result.subjectHash, swapPlanIds: [] };
  }
  const receipt: MatcherMutationReceipt = {
    version: PERSISTENT_MATCHER_VERSION,
    sequence,
    requestId,
    commandHash,
    kind: event.kind,
    occurredAtSeconds: event.occurredAtSeconds,
    ...details,
  };
  const nextState: PersistentMatcherState = {
    ...changed,
    sequence,
    lastEventAtSeconds: event.occurredAtSeconds,
    receipts: [...changed.receipts, receipt],
    requestIndex: { ...changed.requestIndex, [requestId]: receipt },
  };
  matcherStateRoot(nextState);
  return { state: nextState, receipt };
}

export function replayPersistentMatcher(
  initial: PersistentMatcherState,
  events: readonly PersistentMatcherEvent[],
  verifier: MatcherSignatureVerifier,
): PersistentMatcherState {
  return events.reduce((state, event, index) => applyPersistentMatcherEvent(state, event, BigInt(index + 1), verifier).state, initial);
}

export function matcherConfigurationHash(configuration: PersistentMatcherConfiguration): Hex32 {
  assertConfiguration(configuration);
  const pair = configuration.atomicSwapPolicy.pair;
  const limits = configuration.limits;
  return keccak256Text([
    "PhlebasPersistentMatcherConfiguration",
    `version=${PERSISTENT_MATCHER_VERSION}`,
    `domain=${hashOrderDomain(configuration.domain)}`,
    `solverDomain=${configuration.solverQuotePolicy.matcherDomainHash}`,
    `base=${pair.base.network}:${pair.base.asset}:${pair.base.environment}:${pair.base.decimals}`,
    `quote=${pair.quote.network}:${pair.quote.asset}:${pair.quote.environment}:${pair.quote.decimals}`,
    `protocol=${configuration.atomicSwapPolicy.settlementProtocolVersion}`,
    `refunds=${configuration.atomicSwapPolicy.stablecoinRefundDelaySeconds}:${configuration.atomicSwapPolicy.zcashRefundSafetyDeltaSeconds}`,
    `confirmations=${configuration.atomicSwapPolicy.zcashRequiredConfirmations}:${configuration.atomicSwapPolicy.quoteRequiredConfirmations}`,
    `orderLifetime=${configuration.maximumOrderLifetimeSeconds}`,
    `solverLifetime=${configuration.solverQuotePolicy.maximumLifetimeSeconds}`,
    `solverCapacity=${configuration.solverQuotePolicy.maximumCapacityBaseAtoms}`,
    `solverCaps=${configuration.solverQuotePolicy.maximumFeeBps ?? 30n}:${configuration.solverQuotePolicy.maximumSlippageBps ?? 2_000n}`,
    `limits=${limits.minimumBaseAmountAtoms}:${limits.maximumBaseAmountAtoms}:${limits.maximumAcceptedOrders}:${limits.maximumOpenOrders}:${limits.maximumOpenOrdersPerAccount}:${limits.maximumSolverQuotes}:${limits.maximumRouteFills}:${limits.maximumSolverFills}`,
  ].join("\n"));
}

function canonicalStateValue(value: unknown, ancestors = new Set<object>(), depth = 0, counter = { value: 0 }): string {
  counter.value += 1;
  if (counter.value > 1_000_000) throw new RangeError("Matcher state exceeds the canonical node limit");
  if (depth > 64) throw new RangeError("Matcher state exceeds the canonical depth limit");
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "bigint") return `{"$bigint":${JSON.stringify(value.toString())}}`;
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError("Matcher state numbers must be safe integers");
    return JSON.stringify(value);
  }
  if (typeof value !== "object") throw new TypeError("Matcher state must contain only canonical data values");
  if (ancestors.has(value)) throw new TypeError("Matcher state must not contain cycles");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((item) => canonicalStateValue(item, ancestors, depth + 1, counter)).join(",")}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) throw new TypeError("Matcher state objects must be plain");
    return `{${Object.keys(value).sort().map((key) => {
      const item = (value as Record<string, unknown>)[key];
      if (item === undefined) throw new TypeError("Matcher state cannot contain undefined");
      return `${JSON.stringify(key)}:${canonicalStateValue(item, ancestors, depth + 1, counter)}`;
    }).join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function matcherStateRoot(state: PersistentMatcherState): Hex32 {
  if (state.version !== PERSISTENT_MATCHER_VERSION) throw new Error("Matcher state version is unsupported");
  if (typeof state.sequence !== "bigint" || state.sequence < 0n || state.sequence > UINT64_MAX) {
    throw new RangeError("Matcher state sequence is invalid");
  }
  if (typeof state.lastEventAtSeconds !== "bigint" || state.lastEventAtSeconds < 0n || state.lastEventAtSeconds > UINT64_MAX) {
    throw new RangeError("Matcher state event time is invalid");
  }
  matcherConfigurationHash(state.configuration);
  orderReferenceSnapshot(state.orderReference);
  if (state.sequence > BigInt(Number.MAX_SAFE_INTEGER) || state.receipts.length !== Number(state.sequence)) {
    throw new Error("Matcher receipts do not cover the complete event sequence");
  }
  const indexedRequestIds = Object.keys(state.requestIndex).sort();
  const receiptRequestIds: string[] = [];
  const seenRequestIds = new Set<string>();
  for (let index = 0; index < state.receipts.length; index += 1) {
    const receipt = state.receipts[index];
    if (!receipt || receipt.sequence !== BigInt(index + 1)) throw new Error("Matcher receipt sequence is not contiguous");
    const requestId = canonicalRequestId(receipt.requestId);
    if (seenRequestIds.has(requestId)) throw new Error("Matcher receipt request ID is duplicated");
    seenRequestIds.add(requestId);
    receiptRequestIds.push(requestId);
    const indexed = state.requestIndex[requestId];
    if (!indexed || canonicalStateValue(indexed) !== canonicalStateValue(receipt)) {
      throw new Error("Matcher request index does not match its receipt");
    }
  }
  if (indexedRequestIds.join("\n") !== [...receiptRequestIds].sort().join("\n")) {
    throw new Error("Matcher request index has missing or unsupported entries");
  }
  const accountKeys = Object.keys(state.orderAccounts).sort();
  const acceptedKeys = Object.keys(state.orderReference.acceptedOrders).sort();
  if (accountKeys.join("\n") !== acceptedKeys.join("\n")) throw new Error("Matcher settlement accounts do not cover accepted orders");
  for (const [orderHash, accounts] of Object.entries(state.orderAccounts)) {
    const accepted = state.orderReference.acceptedOrders[orderHash];
    if (!accepted) throw new Error("Matcher settlement accounts reference an unknown order");
    assertSettlementAccounts(accepted.order, accounts);
  }
  for (const [orderHash, entry] of Object.entries(state.openOrders)) {
    if (normalizeHex32(orderHash, "Open order key") !== normalizeHex32(entry.sequenced.orderHash, "Open order hash")) {
      throw new Error("Open order key does not match its order hash");
    }
    if (hashTypedOrder(state.configuration.domain, entry.sequenced.order) !== orderHash) throw new Error("Open order body does not match its hash");
    assertSettlementAccounts(entry.sequenced.order, entry.accounts);
  }
  for (const [quoteHash, accepted] of Object.entries(state.solverQuotes)) {
    if (normalizeHex32(quoteHash, "Solver quote key") !== normalizeHex32(accepted.quoteHash, "Solver quote hash")
      || hashSolverQuote(accepted.quote) !== quoteHash) {
      throw new Error("Solver quote body does not match its hash");
    }
    if (accepted.remainingCapacityBaseAtoms < 0n || accepted.remainingCapacityBaseAtoms > accepted.quote.capacityBaseAtoms) {
      throw new Error("Solver remaining capacity is invalid");
    }
  }
  for (const [quoteHash, marker] of Object.entries(state.cancelledSolverQuotes)) {
    if (marker !== true || !state.solverQuotes[normalizeHex32(quoteHash, "Cancelled solver quote hash")]) {
      throw new Error("Cancelled solver quote marker is invalid");
    }
  }
  return keccak256Text(`PhlebasPersistentMatcherState\n${canonicalStateValue(state)}`);
}
