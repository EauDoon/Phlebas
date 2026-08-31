import assert from "node:assert/strict";
import test from "node:test";

import type { WalletSettlementAccounts } from "./atomic-swap-plan.ts";
import { createOrderDomain, hashOrderDomain, hashTypedOrder, type TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
import type { MatcherSignatureVerifier } from "./matcher-auth.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "./order-domain.ts";
import { VENUE_CLOB, VENUE_SOLVER } from "./order-policy.ts";
import {
  applyPersistentMatcherEvent,
  createPersistentMatcher,
  findRequestReceipt,
  matcherCommandHash,
  matcherStateRoot,
  replayPersistentMatcher,
  type PersistentMatcherConfiguration,
  type PersistentMatcherEvent,
  type PersistentMatcherState,
} from "./persistent-matcher.ts";
import type { SolverQuote } from "./solver-quotes.ts";

const now = 1_800_000_000n;
const domain = createOrderDomain(42161n, "0x1111111111111111111111111111111111111111");
const baseNetwork = "bip122:00040fe8ec8471911baa1db1266ea15d";
const baseAsset = `${baseNetwork}/slip44:133`;
const quoteNetwork = "eip155:42161";
const quoteAsset = `${quoteNetwork}/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831`;
const protocol = "transparent-htlc-v1";
const configuration: PersistentMatcherConfiguration = {
  domain,
  atomicSwapPolicy: {
    orderDomain: domain,
    pair: {
      base: { network: baseNetwork, asset: baseAsset, environment: "mainnet", decimals: 8 },
      quote: { network: quoteNetwork, asset: quoteAsset, environment: "mainnet", decimals: 6 },
    },
    settlementProtocolVersion: protocol,
    stablecoinRefundDelaySeconds: 3_600n,
    zcashRefundSafetyDeltaSeconds: 7_200n,
    zcashRequiredConfirmations: 10,
    quoteRequiredConfirmations: 65,
  },
  solverQuotePolicy: {
    matcherDomainHash: hashOrderDomain(domain),
    baseNetwork,
    baseAsset,
    quoteNetwork,
    quoteAsset,
    settlementProtocolVersion: protocol,
    maximumCapacityBaseAtoms: 10_000_000_000n,
    maximumLifetimeSeconds: 10_000n,
  },
  maximumOrderLifetimeSeconds: 10_000n,
  limits: {
    minimumBaseAmountAtoms: 1n,
    maximumBaseAmountAtoms: 10_000_000_000n,
    maximumAcceptedOrders: 1_000,
    maximumOpenOrders: 100,
    maximumOpenOrdersPerAccount: 10,
    maximumSolverQuotes: 100,
    maximumRouteFills: 16,
    maximumSolverFills: 8,
  },
};
const verifier: MatcherSignatureVerifier = { verify() {} };

function intent(name: string, side: 0 | 1, amount: bigint, price: bigint, tif: 0 | 1 | 2, nonce: bigint, venues = 3) {
  const sourceAccount = side === 0
    ? `${quoteNetwork}:0x${nonce.toString(16).padStart(40, "0")}`
    : `zcash:mainnet:t3-${name}`;
  const recipientAccount = side === 0
    ? `zcash:mainnet:t3-${name}`
    : `${quoteNetwork}:0x${(nonce + 1_000n).toString(16).padStart(40, "0")}`;
  const order: TypedOrderIntent = {
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
    nonce,
    accountEpoch: 0n,
    expiry: now + 5_000n,
    salt: keccak256Text(`hashlock:${name}:${nonce}`),
    timeInForce: tif,
    maximumFeeBps: 30n,
    allowedVenues: venues,
    settlementAdapterId: adapterIdentifier(protocol),
  };
  return { order, accounts: { sourceAccount, recipientAccount } satisfies WalletSettlementAccounts };
}

function acceptEvent(
  requestId: string,
  value: ReturnType<typeof intent>,
  occurredAtSeconds = now,
): Extract<PersistentMatcherEvent, { kind: "accept-order" }> {
  return {
    version: 1,
    requestId,
    occurredAtSeconds,
    kind: "accept-order",
    submission: { ...value, signature: `signature:${requestId}` },
  };
}

function apply(state: PersistentMatcherState, event: PersistentMatcherEvent) {
  return applyPersistentMatcherEvent(state, event, state.sequence + 1n, verifier);
}

function solverQuote(name: string, side: 0 | 1, amount: bigint, price: bigint, nonce: bigint): SolverQuote {
  const sourceAccount = side === 0
    ? `${quoteNetwork}:0x${(nonce + 2_000n).toString(16).padStart(40, "0")}`
    : `zcash:mainnet:t3-solver-${name}`;
  const recipientAccount = side === 0
    ? `zcash:mainnet:t3-solver-${name}`
    : `${quoteNetwork}:0x${(nonce + 3_000n).toString(16).padStart(40, "0")}`;
  return {
    version: 1,
    matcherDomainHash: hashOrderDomain(domain),
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
    capacityBaseAtoms: amount,
    minimumFillBaseAtoms: 1n,
    pricePolicy: { kind: "fixed", priceTicks: price },
    maximumSlippageBps: 0n,
    feeBps: 0n,
    nonce,
    expirySeconds: now + 4_000n,
    settlementProtocolVersion: protocol,
  };
}

test("sequences GTC intake and atomically maps an IOC cross to a no-value plan", () => {
  let state = createPersistentMatcher(configuration);
  const maker = intent("maker", 1, 100_000_000n, 5_000n, 0, 1n, VENUE_CLOB);
  const makerResult = apply(state, acceptEvent("maker-1", maker));
  state = makerResult.state;
  assert.equal(makerResult.receipt.status, "open");
  assert.equal(Object.keys(state.openOrders).length, 1);

  const taker = intent("taker", 0, 100_000_000n, 5_100n, 1, 2n, VENUE_CLOB);
  const takerResult = apply(state, acceptEvent("taker-1", taker, now + 1n));
  state = takerResult.state;
  assert.equal(takerResult.receipt.status, "filled");
  assert.equal(takerResult.receipt.routeKind, "order-book");
  assert.equal(takerResult.receipt.swapPlanIds.length, 1);
  assert.equal(Object.keys(state.openOrders).length, 0);
  assert.equal(state.executions.at(-1)?.route?.fills[0]?.swapPlan.execution.status, "blocked");
  assert.equal(state.executions.at(-1)?.route?.fills[0]?.swapPlan.unilateralSpendingAuthority, false);
});

test("preserves IOC remainder cancellation and FOK all-or-nothing semantics", () => {
  const maker = intent("maker", 1, 100n, 5_000n, 0, 1n, VENUE_CLOB);
  const initial = apply(createPersistentMatcher(configuration), acceptEvent("maker", maker)).state;

  const ioc = apply(initial, acceptEvent("ioc", intent("ioc", 0, 200n, 5_100n, 1, 2n, VENUE_CLOB), now + 1n));
  assert.equal(ioc.receipt.status, "ioc-remainder-cancelled");
  assert.equal(ioc.receipt.remainingBaseAtoms, 100n);
  assert.equal(Object.values(ioc.state.openOrders).some((entry) => entry.sequenced.order.makerAccountId === intent("ioc", 0, 200n, 5_100n, 1, 2n).order.makerAccountId), false);

  const fok = apply(initial, acceptEvent("fok", intent("fok", 0, 200n, 5_100n, 2, 3n, VENUE_CLOB), now + 1n));
  assert.equal(fok.receipt.status, "fok-rejected");
  assert.equal(fok.receipt.swapPlanIds.length, 0);
  assert.equal(Object.values(fok.state.openOrders)[0]?.sequenced.remainingBaseAtoms, 100n);
});

test("accepts and consumes wallet-held solver capacity under the same sequence", () => {
  let state = createPersistentMatcher(configuration);
  const quote = solverQuote("one", 1, 200_000_000n, 5_000n, 1n);
  const quoteResult = apply(state, {
    version: 1,
    requestId: "solver-quote-1",
    occurredAtSeconds: now,
    kind: "accept-solver-quote",
    quote,
    signature: "solver-signature",
  });
  state = quoteResult.state;
  assert.equal(quoteResult.receipt.status, "solver-quote-open");
  const quoteHash = quoteResult.receipt.subjectHash;
  assert.ok(quoteHash);

  const taker = intent("solver-taker", 0, 100_000_000n, 5_100n, 1, 2n, VENUE_SOLVER);
  const traded = apply(state, acceptEvent("solver-taker-1", taker, now + 1n));
  assert.equal(traded.receipt.routeKind, "solver");
  assert.equal(traded.state.solverQuotes[quoteHash]?.remainingCapacityBaseAtoms, 100_000_000n);
  assert.equal(Object.keys(traded.state.openOrders).length, 0);
});

test("authenticates cancellation and epoch advancement before removing liquidity", () => {
  const maker = intent("maker", 1, 100n, 5_000n, 0, 1n, VENUE_CLOB);
  let state = apply(createPersistentMatcher(configuration), acceptEvent("maker", maker)).state;
  const orderHash = hashTypedOrder(domain, maker.order);
  const cancelled = apply(state, {
    version: 1,
    requestId: "cancel-maker",
    occurredAtSeconds: now + 1n,
    kind: "cancel-order",
    orderHash,
    signature: "cancel-signature",
  });
  state = cancelled.state;
  assert.equal(cancelled.receipt.status, "cancelled");
  assert.equal(Object.keys(state.openOrders).length, 0);

  const makerTwo = intent("maker-two", 1, 100n, 5_000n, 0, 2n, VENUE_CLOB);
  const sameAccountOrder = {
    ...makerTwo,
    order: {
      ...makerTwo.order,
      makerAccountId: maker.order.makerAccountId,
      authorizedSignerId: maker.order.authorizedSignerId,
      recipientAccountId: maker.order.recipientAccountId,
    },
    accounts: maker.accounts,
  };
  state = apply(state, acceptEvent("maker-two", sameAccountOrder, now + 2n)).state;
  const advanced = apply(state, {
    version: 1,
    requestId: "epoch-maker",
    occurredAtSeconds: now + 3n,
    kind: "advance-epoch",
    makerAccountId: maker.order.makerAccountId,
    nextEpoch: 1n,
    authorizedSignerId: maker.order.authorizedSignerId,
    signature: "epoch-signature",
  });
  assert.equal(advanced.receipt.status, "epoch-advanced");
  assert.equal(Object.keys(advanced.state.openOrders).length, 0);
});

test("replays identical state roots and rejects sequence, time, request, and size violations", () => {
  const first = acceptEvent("one", intent("one", 1, 100n, 5_000n, 0, 1n), now);
  const second = acceptEvent("two", intent("two", 0, 100n, 5_000n, 1, 2n), now + 1n);
  const replayed = replayPersistentMatcher(createPersistentMatcher(configuration), [first, second], verifier);
  const repeated = replayPersistentMatcher(createPersistentMatcher(configuration), [first, second], verifier);
  assert.equal(matcherStateRoot(replayed), matcherStateRoot(repeated));
  const receipt = findRequestReceipt(replayed, "one", matcherCommandHash(configuration, first));
  assert.equal(receipt?.sequence, 1n);
  assert.throws(() => findRequestReceipt(replayed, "one", keccak256Text("different")), /different command/);
  assert.throws(() => applyPersistentMatcherEvent(replayed, first, replayed.sequence + 2n, verifier), /not contiguous/);
  assert.throws(() => applyPersistentMatcherEvent(replayed, { ...first, requestId: "late", occurredAtSeconds: now - 1n }, replayed.sequence + 1n, verifier), /moved backward/);
  assert.throws(() => apply(replayed, { ...first, requestId: "one" }), /already has/);

  const before = matcherStateRoot(replayed);
  const oversized = acceptEvent("oversized", intent("huge", 1, configuration.limits.maximumBaseAmountAtoms + 1n, 5_000n, 0, 99n), now + 2n);
  assert.throws(() => apply(replayed, oversized), /outside matcher limits/);
  assert.equal(matcherStateRoot(replayed), before);
});

test("commits the complete replay state canonically and rejects a corrupt request index", () => {
  const first = acceptEvent("root-one", intent("root-one", 1, 100n, 5_000n, 0, 41n), now);
  const second = acceptEvent("root-two", intent("root-two", 0, 100n, 5_000n, 1, 42n), now + 1n);
  const replayed = replayPersistentMatcher(createPersistentMatcher(configuration), [first, second], verifier);
  const root = matcherStateRoot(replayed);
  const reordered = {
    ...replayed,
    orderAccounts: Object.fromEntries(Object.entries(replayed.orderAccounts).reverse()),
    requestIndex: Object.fromEntries(Object.entries(replayed.requestIndex).reverse()),
  };
  assert.equal(matcherStateRoot(reordered), root);

  const signerEntry = Object.entries(replayed.accountSigners)[0];
  assert.ok(signerEntry);
  const changedSigner = {
    ...replayed,
    accountSigners: {
      ...replayed.accountSigners,
      [signerEntry[0]]: keccak256Text("different-signer"),
    },
  };
  assert.notEqual(matcherStateRoot(changedSigner), root);

  const indexed = replayed.requestIndex[first.requestId];
  assert.ok(indexed);
  const corruptIndex = {
    ...replayed,
    requestIndex: {
      ...replayed.requestIndex,
      [first.requestId]: { ...indexed, commandHash: keccak256Text("corrupt-command") },
    },
  };
  assert.throws(() => matcherStateRoot(corruptIndex), /request index does not match/);
});

test("solver cancellation is authenticated and makes the quote unmatchable", () => {
  const quote = solverQuote("cancel", 1, 100n, 5_000n, 1n);
  let state = apply(createPersistentMatcher(configuration), {
    version: 1,
    requestId: "quote",
    occurredAtSeconds: now,
    kind: "accept-solver-quote",
    quote,
    signature: "quote-signature",
  }).state;
  const quoteHash = Object.keys(state.solverQuotes)[0] as `0x${string}`;
  state = apply(state, {
    version: 1,
    requestId: "cancel-quote",
    occurredAtSeconds: now + 1n,
    kind: "cancel-solver-quote",
    quoteHash,
    signature: "cancel-signature",
  }).state;
  const taker = intent("after-cancel", 0, 100n, 5_100n, 1, 2n, VENUE_SOLVER);
  const result = apply(state, acceptEvent("after-cancel", taker, now + 2n));
  assert.equal(result.receipt.status, "unfilled");
  assert.equal(result.receipt.swapPlanIds.length, 0);
});
