import assert from "node:assert/strict";
import test from "node:test";

import type { AtomicSwapPolicy, WalletSettlementAccounts } from "./atomic-swap-plan.ts";
import { createOrderDomain, hashOrderDomain, hashTypedOrder, type TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import { compareExecutableRoutes, type RestingRouteOrder } from "./matcher-routing.ts";
import type { MatcherSignatureVerifier } from "./matcher-auth.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "./order-domain.ts";
import { VENUE_CLOB, VENUE_SOLVER } from "./order-policy.ts";
import type { SequencedOrder } from "./price-time.ts";
import { acceptSolverQuote, type SolverQuote, type SolverQuotePolicy } from "./solver-quotes.ts";

const now = 1_800_000_000n;
const baseNetwork = "bip122:00040fe8ec8471911baa1db1266ea15d";
const baseAsset = `${baseNetwork}/slip44:133`;
const quoteNetwork = "eip155:42161";
const quoteAsset = `${quoteNetwork}/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831`;
const protocol = "transparent-htlc-v1";
const orderDomain = createOrderDomain(42161n, "0x1111111111111111111111111111111111111111");
const atomicSwapPolicy: AtomicSwapPolicy = {
  orderDomain,
  pair: {
    base: { network: baseNetwork, asset: baseAsset, environment: "mainnet", decimals: 8 },
    quote: { network: quoteNetwork, asset: quoteAsset, environment: "mainnet", decimals: 6 },
  },
  settlementProtocolVersion: protocol,
  stablecoinRefundDelaySeconds: 3_600n,
  zcashRefundSafetyDeltaSeconds: 7_200n,
  zcashRequiredConfirmations: 10,
  quoteRequiredConfirmations: 65,
};
const solverPolicy: SolverQuotePolicy = {
  matcherDomainHash: hashOrderDomain(orderDomain),
  baseNetwork,
  baseAsset,
  quoteNetwork,
  quoteAsset,
  settlementProtocolVersion: protocol,
  maximumCapacityBaseAtoms: 1_000_000_000n,
  maximumLifetimeSeconds: 10_000n,
};
const verifier: MatcherSignatureVerifier = { verify() {} };

function zcashAccount(name: string): string {
  const address = `t3${keccak256Text(`zcash:${name}`).slice(2).replaceAll("0", "a").slice(0, 33)}`;
  return `zcash:mainnet:${address}`;
}

function order(name: string, side: 0 | 1, price: bigint, amount: bigint, sequence: bigint, tif: 0 | 1 | 2 = 1, venues = 3) {
  const sourceAccount = side === 0
    ? `${quoteNetwork}:0x${sequence.toString(16).padStart(40, "0")}`
    : zcashAccount(`${name}:source`);
  const recipientAccount = side === 0
    ? zcashAccount(`${name}:recipient`)
    : `${quoteNetwork}:0x${(sequence + 100n).toString(16).padStart(40, "0")}`;
  const intent: TypedOrderIntent = {
    makerAccountId: accountIdentifier(sourceAccount),
    authorizedSignerId: accountIdentifier(`${quoteNetwork}:signer-${name}`),
    recipientAccountId: accountIdentifier(recipientAccount),
    baseChainId: chainIdentifier(baseNetwork),
    baseAssetId: assetIdentifier(baseAsset),
    quoteChainId: chainIdentifier(quoteNetwork),
    quoteAssetId: assetIdentifier(quoteAsset),
    side,
    baseAmountAtoms: amount,
    limitPriceTicks: price,
    nonce: sequence,
    accountEpoch: 0n,
    expiry: now + 10_000n,
    salt: keccak256Text(`hashlock:${name}`),
    timeInForce: tif,
    maximumFeeBps: 30n,
    allowedVenues: venues,
    settlementAdapterId: adapterIdentifier(protocol),
  };
  const sequenced: SequencedOrder = {
    orderHash: hashTypedOrder(orderDomain, intent),
    sequence,
    order: intent,
    remainingBaseAtoms: amount,
  };
  return { sequenced, accounts: { sourceAccount, recipientAccount } satisfies WalletSettlementAccounts };
}

function solver(name: string, side: 0 | 1, price: bigint, capacity: bigint, sequence: bigint, feeBps = 0n) {
  const sourceAccount = side === 0
    ? `${quoteNetwork}:0x${(sequence + 200n).toString(16).padStart(40, "0")}`
    : zcashAccount(`solver:${name}:source`);
  const recipientAccount = side === 0
    ? zcashAccount(`solver:${name}:recipient`)
    : `${quoteNetwork}:0x${(sequence + 300n).toString(16).padStart(40, "0")}`;
  const value: SolverQuote = {
    version: 1,
    matcherDomainHash: hashOrderDomain(orderDomain),
    solverAccountId: accountIdentifier(sourceAccount),
    authorizedSignerId: accountIdentifier(`${quoteNetwork}:solver-signer-${name}`),
    recipientAccountId: accountIdentifier(recipientAccount),
    sourceAccount,
    recipientAccount,
    baseNetwork,
    baseAsset,
    quoteNetwork,
    quoteAsset,
    side,
    capacityBaseAtoms: capacity,
    minimumFillBaseAtoms: 1n,
    pricePolicy: { kind: "fixed", priceTicks: price },
    maximumSlippageBps: 0n,
    feeBps,
    accountEpoch: 0n,
    nonce: sequence,
    expirySeconds: now + 5_000n,
    settlementProtocolVersion: protocol,
  };
  return acceptSolverQuote(value, "signature", sequence, now, solverPolicy, verifier);
}

function compare(taker: ReturnType<typeof order>, restingOrders: RestingRouteOrder[], solverQuotes: ReturnType<typeof solver>[]) {
  return compareExecutableRoutes({
    taker: taker.sequenced,
    takerAccounts: taker.accounts,
    restingOrders,
    solverQuotes,
    acceptedAtSeconds: now,
    atomicSwapPolicy,
  });
}

test("selects the lower all-in solver cost over a complete order-book route", () => {
  const taker = order("taker", 0, 5_200n, 100_000_000n, 10n);
  const result = compare(taker, [order("maker", 1, 5_100n, 100_000_000n, 1n, 0)], [solver("solver", 1, 5_000n, 100_000_000n, 2n, 10n)]);
  assert.equal(result.selected?.kind, "solver");
  assert.equal(result.selected?.complete, true);
  assert.equal(result.selected?.fills[0]?.swapPlan.execution.status, "blocked");
});

test("selects a bounded combination when cheap book depth needs solver capacity", () => {
  const taker = order("taker", 0, 5_200n, 200_000_000n, 10n);
  const result = compare(taker, [order("maker", 1, 4_900n, 100_000_000n, 1n, 0)], [solver("solver", 1, 5_000n, 100_000_000n, 2n)]);
  assert.equal(result.selected?.kind, "combined");
  assert.equal(result.selected?.fills.length, 2);
  assert.deepEqual(result.selected?.fills.map((fill) => fill.venue), ["order-book", "solver"]);
  assert.equal(result.selected?.fills.every((fill) => fill.swapPlan.platformRetainedBaseAtoms === "0"), true);
});

test("FOK produces no selected route when bounded capacity cannot fill the order", () => {
  const taker = order("taker", 0, 5_200n, 300_000_000n, 10n, 2);
  const result = compare(taker, [order("maker", 1, 4_900n, 100_000_000n, 1n, 0)], [solver("solver", 1, 5_000n, 100_000_000n, 2n)]);
  assert.equal(result.selected, null);
  assert.equal(result.candidates.every((candidate) => candidate.fills.length === 0), true);
});

test("FOK can combine partial book depth with solver capacity atomically", () => {
  const taker = order("fok-combined", 0, 5_200n, 100n, 10n, 2, VENUE_CLOB | VENUE_SOLVER);
  const result = compare(
    taker,
    [order("book-maker", 1, 5_000n, 40n, 1n, 0)],
    [solver("solver-maker", 1, 5_010n, 60n, 2n)],
  );
  assert.equal(result.selected?.kind, "combined");
  assert.equal(result.selected?.complete, true);
  assert.equal(result.selected?.filledBaseAtoms, 100n);
  assert.deepEqual(result.selected?.fills.map((fill) => fill.baseAmountAtoms), [40n, 60n]);
});

test("honors venue masks, quote expiry, fee caps, and self-trade prevention", () => {
  const clobOnly = order("taker", 0, 5_200n, 100_000_000n, 10n, 1, VENUE_CLOB);
  assert.equal(compare(clobOnly, [], [solver("solver", 1, 5_000n, 100_000_000n, 2n)]).selected, null);

  const solverOnly = order("solver-only", 0, 5_200n, 100_000_000n, 10n, 1, VENUE_SOLVER);
  const expensiveFee = solver("fee", 1, 5_000n, 100_000_000n, 2n, 30n);
  const lowFeeCap = { ...solverOnly, sequenced: { ...solverOnly.sequenced, order: { ...solverOnly.sequenced.order, maximumFeeBps: 29n } } };
  assert.equal(compare(lowFeeCap, [], [expensiveFee]).selected, null);

  const active = solver("expiry", 1, 5_000n, 100_000_000n, 3n);
  const expired = { ...active, quote: { ...active.quote, expirySeconds: now } };
  assert.equal(compare(solverOnly, [], [expired]).selected, null);
});

test("skips fee-adjusted limit and dust segments without failing the taker command", () => {
  const taker = order("limit-taker", 0, 5_000n, 100_000_000n, 10n);
  const book = order("book-fallback", 1, 4_990n, 100_000_000n, 1n, 0);
  const invalidAllInSolver = solver("all-in-limit", 1, 5_000n, 100_000_000n, 2n, 10n);
  const withFallback = compare(taker, [book], [invalidAllInSolver]);
  assert.equal(withFallback.selected?.kind, "order-book");
  assert.equal(withFallback.selected?.complete, true);
  assert.equal(withFallback.candidates.some((candidate) => candidate.kind === "solver" && candidate.filledBaseAtoms > 0n), false);

  const dustTaker = order("dust-taker", 0, 1n, 1n, 20n, 1, VENUE_SOLVER);
  const dustSolver = solver("dust-solver", 1, 1n, 1n, 21n);
  assert.equal(compare(dustTaker, [], [dustSolver]).selected, null);
});

test("tie-breaking is deterministic and prefers fewer fills before route rank", () => {
  const taker = order("taker", 0, 5_200n, 100_000_000n, 10n);
  const maker = order("maker", 1, 5_000n, 100_000_000n, 1n, 0);
  const quote = solver("solver", 1, 5_000n, 100_000_000n, 2n);
  const first = compare(taker, [maker], [quote]);
  const second = compare(taker, [maker], [quote]);
  assert.deepEqual(first, second);
  assert.equal(first.selected?.kind, "order-book");
});

test("assigns a unique deterministic plan ID to equal-price solver curve fills", () => {
  const taker = order("curve-taker", 0, 5_200n, 20n, 10n, 1, VENUE_SOLVER);
  const template = solver("curve-solver", 1, 5_000n, 20n, 2n);
  const quote: SolverQuote = {
    ...template.quote,
    pricePolicy: {
      kind: "curve",
      levels: [
        { cumulativeBaseAtoms: 10n, priceTicks: 5_000n },
        { cumulativeBaseAtoms: 20n, priceTicks: 5_000n },
      ],
    },
  };
  const accepted = acceptSolverQuote(quote, "signature", 2n, now, solverPolicy, verifier);
  const result = compare(taker, [], [accepted]);
  assert.equal(result.selected?.fills.length, 2);
  assert.deepEqual(result.selected?.fills.map((fill) => fill.swapPlan.fillIndex), [0, 1]);
  assert.notEqual(result.selected?.fills[0]?.swapPlan.planId, result.selected?.fills[1]?.swapPlan.planId);
});

test("route and solver fill caps fail closed without residual plans", () => {
  const taker = order("taker", 0, 5_200n, 200_000_000n, 10n, 2);
  const result = compareExecutableRoutes({
    taker: taker.sequenced,
    takerAccounts: taker.accounts,
    restingOrders: [],
    solverQuotes: [
      solver("one", 1, 5_000n, 100_000_000n, 1n),
      solver("two", 1, 5_000n, 100_000_000n, 2n),
    ],
    acceptedAtSeconds: now,
    atomicSwapPolicy,
    maximumFills: 1,
    maximumSolverFills: 1,
  });
  assert.equal(result.selected, null);
  assert.equal(result.candidates[0]?.fills.length, 0);
  assert.throws(() => compareExecutableRoutes({
    taker: taker.sequenced,
    takerAccounts: taker.accounts,
    restingOrders: [],
    solverQuotes: [],
    acceptedAtSeconds: now,
    atomicSwapPolicy,
    maximumFills: 0,
  }), /Maximum route fills/);
});
