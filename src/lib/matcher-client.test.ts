import assert from "node:assert/strict";
import test from "node:test";

import { type AtomicSwapPair } from "./atomic-swap-plan.ts";
import { createOrderDomain, hashOrderDomain, hashTypedOrder, type TypedOrderIntent } from "./eip712-order.ts";
import { evmAuthorizedSignerId } from "./matcher-auth.ts";
import {
  MATCHER_API_PATH,
  MATCHER_BUY_ONLY_REASON,
  MATCHER_IDEMPOTENCY_HEADER,
  MATCHER_ORDER_OPERATION,
  MatcherOrderClientError,
  assertMatcherAccountIdentity,
  assertMatcherHealthIdentity,
  assertMatcherOrderReceipt,
  buildMatcherOrderRequest,
  serializeMatcherOrderSubmission,
  type ExpectedMatcherIdentity,
  type MatcherOrderPayload,
  type MatcherOrderSubmissionInput,
} from "./matcher-client.ts";
import { matcherConfigurationHash, type PersistentMatcherConfiguration, type PersistentMatcherEvent } from "./persistent-matcher.ts";
import {
  UINT64_MAX,
  accountIdentifier,
  adapterIdentifier,
  assetIdentifier,
  chainIdentifier,
} from "./order-domain.ts";
import { VENUE_CLOB } from "./order-policy.ts";
import { hash160Value, p2shAddress } from "./zcash-address.ts";
import { serializePersistentMatcherEvent } from "../../services/matcher/persistent-store.ts";

const NOW = 1_800_000_000n;
const CHAIN_ID = 421_614n;
const SIGNER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const SIGNATURE = "0xac14f0e6c59ffb853f21cf338a836705e68850f44f371eab0b06169856c8a7b86df9706894f19e865330d47237bf726503a8704e617920c5a23011b22ad850ba1c";
const BASE_NETWORK = "bip122:00040fe8ec8471911baa1db1266ea15d";
const BASE_ASSET = `${BASE_NETWORK}/slip44:133`;
const QUOTE_NETWORK = `eip155:${CHAIN_ID}`;
const QUOTE_ASSET = `${QUOTE_NETWORK}/erc20:0x2222222222222222222222222222222222222222`;
const PROTOCOL = "transparent-htlc-v1";
const SOURCE_ACCOUNT = `${QUOTE_NETWORK}:${SIGNER}`;
const RECIPIENT_ACCOUNT = `zcash:mainnet:${p2shAddress(new Uint8Array(20).fill(0xaa), "mainnet")}`;
const domain = createOrderDomain(CHAIN_ID, "0x1111111111111111111111111111111111111111");
const market: AtomicSwapPair = {
  base: { network: BASE_NETWORK, asset: BASE_ASSET, environment: "mainnet", decimals: 8 },
  quote: { network: QUOTE_NETWORK, asset: QUOTE_ASSET, environment: "mainnet", decimals: 6 },
};
const configuration: PersistentMatcherConfiguration = {
  domain,
  atomicSwapPolicy: {
    orderDomain: domain,
    pair: market,
    settlementProtocolVersion: PROTOCOL,
    stablecoinRefundDelaySeconds: 3_600n,
    zcashRefundSafetyDeltaSeconds: 7_200n,
    zcashRequiredConfirmations: 10,
    quoteRequiredConfirmations: 65,
  },
  solverQuotePolicy: {
    matcherDomainHash: hashOrderDomain(domain),
    baseNetwork: BASE_NETWORK,
    baseAsset: BASE_ASSET,
    quoteNetwork: QUOTE_NETWORK,
    quoteAsset: QUOTE_ASSET,
    settlementProtocolVersion: PROTOCOL,
    maximumCapacityBaseAtoms: 10_000_000_000n,
    maximumLifetimeSeconds: 10_000n,
    maximumFeeBps: 0n,
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
const expectedMatcher: ExpectedMatcherIdentity = {
  configurationHash: matcherConfigurationHash(configuration),
  orderDomain: domain,
  market,
  settlementAdapterId: adapterIdentifier(PROTOCOL),
};
const matcherHealth = {
  ok: true,
  matcher: "persistent-native-v1",
  configured: true,
  acceptingMutations: true,
  mode: "no-value",
  custody: false,
  market,
  configurationHash: expectedMatcher.configurationHash,
  sequence: "7",
  stateRoot: `0x${"ab".repeat(32)}`,
};
const matcherAccount = {
  ok: true,
  makerAccountId: evmAuthorizedSignerId(CHAIN_ID, SIGNER),
  configurationHash: expectedMatcher.configurationHash,
  accountEpoch: "0",
  sequence: "7",
  checkpoint: {
    version: 1,
    sequence: "7",
    recordHash: `0x${"bc".repeat(32)}`,
    stateRoot: `0x${"ab".repeat(32)}`,
    configurationHash: expectedMatcher.configurationHash,
  },
};
const order: TypedOrderIntent = {
  makerAccountId: accountIdentifier(SOURCE_ACCOUNT),
  authorizedSignerId: evmAuthorizedSignerId(CHAIN_ID, SIGNER),
  baseChainId: chainIdentifier(BASE_NETWORK),
  baseAssetId: assetIdentifier(BASE_ASSET),
  quoteChainId: chainIdentifier(QUOTE_NETWORK),
  quoteAssetId: assetIdentifier(QUOTE_ASSET),
  side: 0,
  baseAmountAtoms: 100_000_000n,
  limitPriceTicks: 5_291n,
  nonce: 1n,
  accountEpoch: 0n,
  expiry: NOW + 5_000n,
  salt: `0x${"12".repeat(32)}`,
  recipientAccountId: accountIdentifier(RECIPIENT_ACCOUNT),
  timeInForce: 0,
  maximumFeeBps: 0n,
  allowedVenues: VENUE_CLOB,
  settlementAdapterId: adapterIdentifier(PROTOCOL),
};

function input(overrides: Partial<MatcherOrderSubmissionInput> = {}): MatcherOrderSubmissionInput {
  return {
    matcherHealth,
    expectedMatcher,
    requestId: "order:testnet:0001",
    occurredAtSeconds: NOW,
    order,
    signature: SIGNATURE,
    accounts: { sourceAccount: SOURCE_ACCOUNT, recipientAccount: RECIPIENT_ACCOUNT },
    ...overrides,
  };
}

function parsedPayload(requestBody: string): MatcherOrderPayload {
  return JSON.parse(requestBody) as MatcherOrderPayload;
}

test("builds stable proxy bytes that round-trip through the native matcher serializer", () => {
  const value = input();
  const request = buildMatcherOrderRequest(value);
  const payload = parsedPayload(request.body);
  const event: Extract<PersistentMatcherEvent, { kind: "accept-order" }> = {
    version: 1,
    requestId: value.requestId,
    occurredAtSeconds: value.occurredAtSeconds,
    kind: "accept-order",
    submission: {
      order,
      signature: SIGNATURE,
      accounts: value.accounts,
    },
  };
  const native = serializePersistentMatcherEvent(configuration, event);

  assert.equal(request.path, MATCHER_API_PATH);
  assert.equal(request.method, "POST");
  assert.equal(request.operation, MATCHER_ORDER_OPERATION);
  assert.equal(request.requestId, value.requestId);
  assert.equal(request.idempotencyKey, value.requestId);
  assert.deepEqual(request.headers, {
    "content-type": "application/json",
    [MATCHER_IDEMPOTENCY_HEADER]: value.requestId,
  });
  assert.deepEqual(payload, native.payload);
  assert.equal(request.body, serializeMatcherOrderSubmission(value));
  assert.equal(JSON.stringify(payload).includes("eth_sendTransaction"), false);
  assert.equal(JSON.stringify(payload).includes("wallet"), false);
  assert.equal(request.body.includes(MATCHER_ORDER_OPERATION), false);
  assert.equal(Object.isFrozen(request), true);
  assert.equal(Object.isFrozen(request.headers), true);
  assert.equal(Object.isFrozen(request.identity.market.quote), true);
});

test("canonicalizes every signed bytes32 field and the ECDSA recovery byte", () => {
  const upperHex = (value: string) => `0x${value.slice(2).toUpperCase()}` as `0x${string}`;
  const upperOrder: TypedOrderIntent = {
    ...order,
    makerAccountId: upperHex(order.makerAccountId),
    authorizedSignerId: upperHex(order.authorizedSignerId),
    baseChainId: upperHex(order.baseChainId),
    baseAssetId: upperHex(order.baseAssetId),
    quoteChainId: upperHex(order.quoteChainId),
    quoteAssetId: upperHex(order.quoteAssetId),
    salt: upperHex(order.salt),
    recipientAccountId: upperHex(order.recipientAccountId),
    settlementAdapterId: upperHex(order.settlementAdapterId),
  };
  const zeroOrOneRecovery = `0x${SIGNATURE.slice(2, -2).toUpperCase()}01`;
  const request = buildMatcherOrderRequest(input({ order: upperOrder, signature: zeroOrOneRecovery }));
  const serialized = parsedPayload(request.body).submission;

  assert.deepEqual(serialized.order, parsedPayload(buildMatcherOrderRequest(input()).body).submission.order);
  assert.equal(serialized.signature, SIGNATURE);
  assert.match(request.body, /"baseAmountAtoms":"100000000"/);
  assert.doesNotMatch(request.body, /100000000n/);
});

test("is explicitly buy-only and performs no network call for a sell-side order", () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  let observed: unknown;
  try {
    buildMatcherOrderRequest(input({ order: { ...order, side: 1 } }));
  } catch (error) {
    observed = error;
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.ok(observed instanceof MatcherOrderClientError);
  assert.equal(observed.reason, MATCHER_BUY_ONLY_REASON);
  assert.equal(observed.message, "matcher-client-buy-orders-only");
  assert.equal(fetchCalls, 0);
});

test("binds a buy to the exact lowercase source wallet and signing authority", () => {
  assert.equal(order.makerAccountId, order.authorizedSignerId);
  assert.equal(order.makerAccountId, accountIdentifier(SOURCE_ACCOUNT));
  assert.equal(SOURCE_ACCOUNT, SOURCE_ACCOUNT.toLowerCase());

  const differentSource = `${QUOTE_NETWORK}:0x3333333333333333333333333333333333333333`;
  assert.throws(
    () => buildMatcherOrderRequest(input({
      order: { ...order, makerAccountId: accountIdentifier(differentSource) },
      accounts: { sourceAccount: differentSource, recipientAccount: RECIPIENT_ACCOUNT },
    })),
    /maker and authorized signer must be the exact source wallet/,
  );

  const uppercaseSource = `${QUOTE_NETWORK}:0x${SIGNER.slice(2).toUpperCase()}`;
  const uppercaseSourceId = accountIdentifier(uppercaseSource);
  assert.throws(
    () => buildMatcherOrderRequest(input({
      order: { ...order, makerAccountId: uppercaseSourceId, authorizedSignerId: uppercaseSourceId },
      accounts: { sourceAccount: uppercaseSource, recipientAccount: RECIPIENT_ACCOUNT },
    })),
    /exact lowercase chain-qualified address/,
  );

  assert.throws(
    () => buildMatcherOrderRequest(input({
      expectedMatcher: {
        ...expectedMatcher,
        orderDomain: createOrderDomain(CHAIN_ID + 1n, domain.verifyingContract),
      },
    })),
    /quote network does not match the EIP-712 signing domain/,
  );
});

test("derives and returns the exact domain, pair, quote, adapter, and configuration identity", () => {
  const identity = assertMatcherHealthIdentity(matcherHealth, expectedMatcher);
  assert.equal(identity.configurationHash, matcherConfigurationHash(configuration));
  assert.equal(identity.domainHash, hashOrderDomain(domain));
  assert.deepEqual(identity.orderPair, {
    baseChainId: chainIdentifier(BASE_NETWORK),
    baseAssetId: assetIdentifier(BASE_ASSET),
    quoteChainId: chainIdentifier(QUOTE_NETWORK),
    quoteAssetId: assetIdentifier(QUOTE_ASSET),
  });
  assert.equal(identity.market.quote.asset, QUOTE_ASSET);
  assert.equal(identity.settlementAdapterId, adapterIdentifier(PROTOCOL));
});

test("binds the authoritative account epoch to the reviewed maker and matcher checkpoint", () => {
  const account = assertMatcherAccountIdentity(matcherAccount, expectedMatcher, order.makerAccountId);
  assert.equal(account.makerAccountId, order.makerAccountId);
  assert.equal(account.accountEpoch, 0n);
  assert.equal(account.sequence, 7n);
  assert.equal(account.configurationHash, expectedMatcher.configurationHash);
  assert.equal(account.checkpoint.configurationHash, expectedMatcher.configurationHash);
  assert.equal(Object.isFrozen(account.checkpoint), true);

  assert.throws(
    () => assertMatcherAccountIdentity({ ...matcherAccount, accountEpoch: "01" }, expectedMatcher, order.makerAccountId),
    /canonical decimal/,
  );
  assert.throws(
    () => assertMatcherAccountIdentity({ ...matcherAccount, makerAccountId: `0x${"99".repeat(32)}` }, expectedMatcher, order.makerAccountId),
    /does not match the reviewed maker/,
  );
  assert.throws(
    () => assertMatcherAccountIdentity({ ...matcherAccount, configurationHash: `0x${"99".repeat(32)}` }, expectedMatcher, order.makerAccountId),
    /does not match the approved matcher/,
  );
  assert.throws(
    () => assertMatcherAccountIdentity({
      ...matcherAccount,
      checkpoint: { ...matcherAccount.checkpoint, sequence: "6" },
    }, expectedMatcher, order.makerAccountId),
    /does not bind the account view/,
  );
});

test("fails closed for absent, unhealthy, live-value, custodial, or differently configured matcher health", () => {
  const otherQuote = `${QUOTE_NETWORK}/erc20:0x4444444444444444444444444444444444444444`;
  const cases: ReadonlyArray<readonly [unknown, RegExp]> = [
    [undefined, /Matcher health must be an object/],
    [null, /Matcher health must be an object/],
    [{}, /does not identify an accepting persistent matcher/],
    [{ ...matcherHealth, ok: false }, /does not identify/],
    [{ ...matcherHealth, matcher: "legacy-matcher" }, /does not identify/],
    [{ ...matcherHealth, configured: false }, /does not identify/],
    [{ ...matcherHealth, acceptingMutations: false }, /does not identify/],
    [{ ...matcherHealth, mode: "live" }, /no-value non-custodial/],
    [{ ...matcherHealth, custody: true }, /no-value non-custodial/],
    [{ ...matcherHealth, configurationHash: `0x${"cd".repeat(32)}` }, /configuration does not match/],
    [{ ...matcherHealth, configurationHash: undefined }, /must be a string/],
    [{ ...matcherHealth, market: null }, /market must be an object/],
    [{
      ...matcherHealth,
      market: { ...market, quote: { ...market.quote, asset: otherQuote } },
    }, /market does not match/],
  ];
  for (const [health, error] of cases) {
    assert.throws(() => buildMatcherOrderRequest(input({ matcherHealth: health })), error);
  }
});

test("rejects invalid request IDs, times, and non-canonical or unauthorized signatures", () => {
  for (const requestId of ["", " leading", "contains space", "x".repeat(129)]) {
    assert.throws(() => buildMatcherOrderRequest(input({ requestId })), /Request ID is invalid/);
  }
  assert.throws(() => buildMatcherOrderRequest(input({ occurredAtSeconds: -1n })), /uint64 bigint/);
  assert.throws(() => buildMatcherOrderRequest(input({ occurredAtSeconds: UINT64_MAX + 1n })), /uint64 bigint/);
  assert.throws(
    () => buildMatcherOrderRequest(input({ occurredAtSeconds: 1 as unknown as bigint })),
    /uint64 bigint/,
  );
  assert.throws(() => buildMatcherOrderRequest(input({ signature: "0x" })), /65-byte/);
  assert.throws(
    () => buildMatcherOrderRequest(input({ signature: `${SIGNATURE.slice(0, -2)}1d` })),
    /recovery byte/,
  );
  assert.throws(
    () => buildMatcherOrderRequest(input({ signature: `0x${"00".repeat(64)}1b` })),
    /Invalid signature r\/s/,
  );
  assert.throws(
    () => buildMatcherOrderRequest(input({ signature: `0x${SIGNATURE.slice(2, 66)}${"01".repeat(32)}1c` })),
    /does not match the authorized signer ID/,
  );
});

test("rejects pair, quote, adapter, policy, account, role, and shape confusion before serialization", () => {
  const differentQuote = assetIdentifier(`${QUOTE_NETWORK}/erc20:0x5555555555555555555555555555555555555555`);
  assert.throws(
    () => buildMatcherOrderRequest(input({ order: { ...order, quoteAssetId: differentQuote } })),
    /asset-chain pair is not allowed/,
  );
  assert.throws(
    () => buildMatcherOrderRequest(input({ order: { ...order, settlementAdapterId: adapterIdentifier("other-v1") } })),
    /Settlement adapter is not allowed/,
  );
  assert.throws(
    () => buildMatcherOrderRequest(input({ order: { ...order, baseAmountAtoms: 0n } })),
    /Base amount must be a positive/,
  );
  assert.throws(
    () => buildMatcherOrderRequest(input({ order: { ...order, expiry: NOW } })),
    /future uint64/,
  );
  assert.throws(
    () => buildMatcherOrderRequest(input({ order: { ...order, allowedVenues: 4 } })),
    /unknown, fractional, or empty mask/,
  );
  assert.throws(
    () => buildMatcherOrderRequest(input({
      accounts: { sourceAccount: `${QUOTE_NETWORK}:0x${"66".repeat(20)}`, recipientAccount: RECIPIENT_ACCOUNT },
    })),
    /source account does not match/,
  );

  const zcashSource = `zcash:mainnet:${p2shAddress(hash160Value(new TextEncoder().encode("matcher-role-confusion")), "mainnet")}`;
  const evmRecipient = `${QUOTE_NETWORK}:0x${"77".repeat(20)}`;
  const roleConfusedOrder: TypedOrderIntent = {
    ...order,
    makerAccountId: accountIdentifier(zcashSource),
    recipientAccountId: accountIdentifier(evmRecipient),
  };
  assert.throws(
    () => buildMatcherOrderRequest(input({
      order: roleConfusedOrder,
      accounts: { sourceAccount: zcashSource, recipientAccount: evmRecipient },
    })),
    /buyer source account/,
  );

  const extraOrder = { ...order, unexpected: true } as TypedOrderIntent;
  assert.throws(() => buildMatcherOrderRequest(input({ order: extraOrder })), /missing or unsupported fields/);
  const extraAccounts = {
    sourceAccount: SOURCE_ACCOUNT,
    recipientAccount: RECIPIENT_ACCOUNT,
    fallbackAccount: RECIPIENT_ACCOUNT,
  } as MatcherOrderSubmissionInput["accounts"];
  assert.throws(() => buildMatcherOrderRequest(input({ accounts: extraAccounts })), /missing or unsupported fields/);
});

test("rejects ambiguous expected matcher identities before trusting health", () => {
  assert.throws(
    () => buildMatcherOrderRequest(input({
      expectedMatcher: { ...expectedMatcher, configurationHash: `0x${"00".repeat(32)}` },
    })),
    /configuration hash cannot be zero/,
  );
  assert.throws(
    () => buildMatcherOrderRequest(input({
      expectedMatcher: { ...expectedMatcher, settlementAdapterId: `0x${"00".repeat(32)}` },
    })),
    /adapter ID cannot be zero/,
  );
  assert.throws(
    () => buildMatcherOrderRequest(input({
      expectedMatcher: {
        ...expectedMatcher,
        orderDomain: { ...domain, name: "Other" } as unknown as ExpectedMatcherIdentity["orderDomain"],
      },
    })),
    /order domain is unsupported/,
  );
  assert.throws(
    () => buildMatcherOrderRequest(input({
      expectedMatcher: {
        ...expectedMatcher,
        market: {
          ...market,
          quote: { ...market.quote, asset: `${BASE_NETWORK}/slip44:133` },
        },
      },
    })),
    /Quote asset must be on its declared network/,
  );
});

test("binds a matcher receipt to the reviewed request, signed order, and configuration", () => {
  const subjectHash = hashTypedOrder(domain, order);
  const response = {
    ok: true,
    replayed: false,
    receipt: {
      version: 1,
      sequence: "8",
      requestId: "order:testnet:0001",
      kind: "accept-order",
      status: "open",
      subjectHash,
      occurredAtSeconds: NOW.toString(),
    },
    checkpoint: {
      version: 1,
      sequence: "8",
      recordHash: `0x${"cd".repeat(32)}`,
      stateRoot: `0x${"ef".repeat(32)}`,
      configurationHash: expectedMatcher.configurationHash,
    },
  };

  const verified = assertMatcherOrderReceipt(response, {
    expectedMatcher,
    requestId: "order:testnet:0001",
    subjectHash,
    occurredAtSeconds: NOW,
  });
  assert.equal(verified.receipt.sequence, 8n);
  assert.equal(verified.receipt.status, "open");
  assert.equal(verified.checkpoint.configurationHash, expectedMatcher.configurationHash);
  assert.equal(Object.isFrozen(verified), true);
  assert.equal(Object.isFrozen(verified.receipt), true);
  assert.equal(Object.isFrozen(verified.checkpoint), true);
});

test("rejects matcher receipts that do not bind the reviewed no-value order", () => {
  const subjectHash = hashTypedOrder(domain, order);
  const base = {
    ok: true,
    replayed: false,
    receipt: {
      version: 1,
      sequence: "8",
      requestId: "order:testnet:0001",
      kind: "accept-order",
      status: "open",
      subjectHash,
      occurredAtSeconds: NOW.toString(),
    },
    checkpoint: {
      version: 1,
      sequence: "8",
      recordHash: `0x${"cd".repeat(32)}`,
      stateRoot: `0x${"ef".repeat(32)}`,
      configurationHash: expectedMatcher.configurationHash,
    },
  };
  const expectation = {
    expectedMatcher,
    requestId: "order:testnet:0001",
    subjectHash,
    occurredAtSeconds: NOW,
  };

  assert.throws(
    () => assertMatcherOrderReceipt({ ...base, receipt: { ...base.receipt, requestId: "order:other" } }, expectation),
    /submitted request/,
  );
  assert.throws(
    () => assertMatcherOrderReceipt({ ...base, receipt: { ...base.receipt, subjectHash: `0x${"11".repeat(32)}` } }, expectation),
    /signed order/,
  );
  assert.throws(
    () => assertMatcherOrderReceipt({ ...base, receipt: { ...base.receipt, occurredAtSeconds: (NOW + 1n).toString() } }, expectation),
    /event time/,
  );
  assert.throws(
    () => assertMatcherOrderReceipt({ ...base, receipt: { ...base.receipt, status: "cancelled" } }, expectation),
    /status is unsupported/,
  );
  assert.throws(
    () => assertMatcherOrderReceipt({ ...base, checkpoint: { ...base.checkpoint, sequence: "9" } }, expectation),
    /does not bind/,
  );
  assert.throws(
    () => assertMatcherOrderReceipt({
      ...base,
      checkpoint: { ...base.checkpoint, configurationHash: `0x${"22".repeat(32)}` },
    }, expectation),
    /approved matcher/,
  );
  assert.throws(
    () => assertMatcherOrderReceipt({ ...base, privateDetail: "must reject" }, expectation),
    /missing or unsupported fields/,
  );
});
