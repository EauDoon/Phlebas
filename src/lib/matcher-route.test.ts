import assert from "node:assert/strict";
import test from "node:test";

import {
  matcherAccountProxy,
  matcherHealthProxy,
  matcherMutationAction,
  matcherMutationProxy,
  matcherOrderProxy,
  matcherRecoveryChallengeProxy,
  matcherRecoveryOrdersProxy,
  type MatcherIngressDeployment,
} from "./matcher-proxy.ts";
import { MATCHER_CONFIGURATION_HEADER } from "./matcher-http.ts";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

test("the matcher proxy parses untrusted bodies with the canonical strict JSON parser, not a private copy", async () => {
  // review-6: the proxy carried a 128-line copy of the parser that
  // services/matcher/strict-json.ts exports. Both sat on an ingress path
  // and nothing made them keep agreeing, so the proxy now imports the
  // canonical parser and defines none of the JSON grammar itself.
  const proxySource = await readFile(
    join(dirname(fileURLToPath(import.meta.url)), "matcher-proxy.ts"),
    "utf8",
  );
  assert.match(proxySource, /from "\.\.\/\.\.\/services\/matcher\/strict-json\.ts"/);
  for (const grammarFunction of [
    "function stringValue",
    "function objectValue",
    "function arrayValue",
    "FORBIDDEN_KEYS",
  ]) {
    assert.doesNotMatch(proxySource, new RegExp(grammarFunction));
  }
});

const CONFIGURATION_HASH = `0x${"11".repeat(32)}`;
const STATE_ROOT = `0x${"22".repeat(32)}`;
const RECORD_HASH = `0x${"33".repeat(32)}`;
const MAKER_ACCOUNT_ID = `0x${"44".repeat(32)}`;
const SUBJECT_HASH = `0x${"55".repeat(32)}`;
const checkpoint = {
  version: 1,
  sequence: "1",
  recordHash: RECORD_HASH,
  stateRoot: STATE_ROOT,
  configurationHash: CONFIGURATION_HASH,
};
const market = {
  base: {
    network: "bip122:00040fe8ec8471911baa1db1266ea15d",
    asset: "bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133",
    environment: "mainnet",
    decimals: 8,
  },
  quote: {
    network: "eip155:1",
    asset: "eip155:1/erc20:0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48",
    environment: "mainnet",
    decimals: 6,
  },
};
const enabledDeployment: MatcherIngressDeployment = {
  enabled: true,
  expectedMatcher: {
    configurationHash: CONFIGURATION_HASH,
    market,
  },
};
const enabledUsdtDeployment: MatcherIngressDeployment = {
  enabled: true,
  expectedMatcher: {
    configurationHash: CONFIGURATION_HASH,
    market: {
      ...market,
      quote: {
        ...market.quote,
        asset: "eip155:1/erc20:0xdac17f958d2ee523a2206206994597c13d831ec7",
      },
    },
  },
};
const orderBody = JSON.stringify({
  version: 1,
  requestId: "order-one",
  occurredAtSeconds: "1800000000",
  kind: "accept-order",
  submission: {},
});
const cancellationBody = JSON.stringify({
  version: 1,
  requestId: "cancel-one",
  occurredAtSeconds: "1800000001",
  kind: "cancel-order",
  orderHash: SUBJECT_HASH,
  signature: "cancel-signature",
});
const epochBody = JSON.stringify({
  version: 1,
  requestId: "epoch-one",
  occurredAtSeconds: "1800000002",
  kind: "advance-epoch",
  makerAccountId: MAKER_ACCOUNT_ID,
  nextEpoch: "2",
  authorizedSignerId: MAKER_ACCOUNT_ID,
  signature: "epoch-signature",
});
const healthBody = JSON.stringify({
  ok: true,
  matcher: "persistent-native-v1",
  configured: true,
  acceptingMutations: true,
  mode: "no-value",
  custody: false,
  market,
  sequence: "1",
  stateRoot: STATE_ROOT,
  configurationHash: CONFIGURATION_HASH,
  checkpoint,
  privateOperatorDetail: "must-not-cross-the-proxy",
});

const originalMatcherUrl = process.env.PHLEBAS_MATCHER_URL;
const originalUsdcMatcherUrl = process.env.PHLEBAS_MATCHER_USDC_URL;
const originalUsdtMatcherUrl = process.env.PHLEBAS_MATCHER_USDT_URL;
const originalProxyKey = process.env.PHLEBAS_MATCHER_PROXY_KEY;
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  if (originalMatcherUrl === undefined) delete process.env.PHLEBAS_MATCHER_URL;
  else process.env.PHLEBAS_MATCHER_URL = originalMatcherUrl;
  if (originalUsdcMatcherUrl === undefined) delete process.env.PHLEBAS_MATCHER_USDC_URL;
  else process.env.PHLEBAS_MATCHER_USDC_URL = originalUsdcMatcherUrl;
  if (originalUsdtMatcherUrl === undefined) delete process.env.PHLEBAS_MATCHER_USDT_URL;
  else process.env.PHLEBAS_MATCHER_USDT_URL = originalUsdtMatcherUrl;
  if (originalProxyKey === undefined) delete process.env.PHLEBAS_MATCHER_PROXY_KEY;
  else process.env.PHLEBAS_MATCHER_PROXY_KEY = originalProxyKey;
  globalThis.fetch = originalFetch;
});

test("ZEC/USDT never falls back to the legacy USDC runtime or accepts its market", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  delete process.env.PHLEBAS_MATCHER_USDT_URL;
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(healthBody, { status: 200 });
  }) as typeof fetch;

  assert.equal((await matcherHealthProxy(process.env, enabledUsdtDeployment)).status, 503);
  assert.equal(calls, 0);

  process.env.PHLEBAS_MATCHER_USDT_URL = "http://127.0.0.1:8789";
  assert.equal((await matcherHealthProxy(process.env, enabledUsdtDeployment)).status, 503);
  assert.equal(calls, 1);
});

test("matcher route stays unavailable without an exact loopback operator URL", async () => {
  delete process.env.PHLEBAS_MATCHER_URL;
  assert.equal((await matcherHealthProxy()).status, 503);
  assert.equal((await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "order-one" },
    body: "{}",
  }))).status, 503);
});

test("matcher POST stays fail-closed before upstream fetch while the deployment manifest is disabled", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(healthBody, { status: 200 });
  }) as typeof fetch;

  const response = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "order-one" },
    body: "{}",
  }));
  assert.equal(response.status, 503);
  assert.equal(calls, 0);
});

test("matcher reads stay fail-closed before upstream fetch while the deployment manifest is disabled", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(healthBody, { status: 200 });
  }) as typeof fetch;

  assert.equal((await matcherHealthProxy()).status, 503);
  assert.equal((await matcherAccountProxy(MAKER_ACCOUNT_ID)).status, 503);
  assert.equal((await matcherRecoveryChallengeProxy(new Request("http://localhost/api/matcher/recovery/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }))).status, 503);
  assert.equal((await matcherRecoveryOrdersProxy(new Request("http://localhost/api/matcher/recovery/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }))).status, 503);
  assert.equal(calls, 0);
});

test("matcher control actions stay fail-closed before upstream fetch while the deployment manifest is disabled", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(healthBody, { status: 200 });
  }) as typeof fetch;

  for (const [action, requestId, body] of [
    ["cancel-order", "cancel-one", cancellationBody],
    ["advance-epoch", "epoch-one", epochBody],
  ] as const) {
    const response = await matcherMutationProxy(new Request("http://localhost/api/matcher", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": requestId },
      body,
    }), action);
    assert.equal(response.status, 503, action);
  }
  assert.equal(calls, 0);
});

test("matcher mutation actions and strict control bodies cannot cross the wrong route", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  assert.equal(matcherMutationAction("cancel-order"), "cancel-order");
  assert.equal(matcherMutationAction("advance-epoch"), "advance-epoch");
  assert.equal(matcherMutationAction("order"), null);

  const paths: string[] = [];
  globalThis.fetch = (async (input) => {
    paths.push((input as URL).pathname);
    return new Response(healthBody, { status: 200 });
  }) as typeof fetch;

  const wrongAction = await matcherMutationProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "cancel-one" },
    body: epochBody,
  }), "cancel-order", process.env, enabledDeployment);
  assert.equal(wrongAction.status, 400);

  const duplicateKind = await matcherMutationProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "cancel-one" },
    body: `{"version":1,"requestId":"cancel-one","occurredAtSeconds":"1800000001","kind":"cancel-order","kind":"advance-epoch","orderHash":"${SUBJECT_HASH}","signature":"cancel-signature"}`,
  }), "cancel-order", process.env, enabledDeployment);
  assert.equal(duplicateKind.status, 400);

  const unknownAction = await matcherMutationProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "cancel-one" },
    body: cancellationBody,
  }), "unknown", process.env, enabledDeployment);
  assert.equal(unknownAction.status, 400);
  assert.deepEqual(paths, []);
});

test("matcher POST requires the approved runtime configuration before forwarding an order", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  const mismatchedHash = `0x${"77".repeat(32)}`;
  const baseHealth = JSON.parse(healthBody) as Record<string, unknown>;
  const cases = [
    {
      name: "configuration hash",
      health: {
        ...baseHealth,
        configurationHash: mismatchedHash,
        checkpoint: { ...checkpoint, configurationHash: mismatchedHash },
      },
    },
    {
      name: "market identity",
      health: {
        ...baseHealth,
        market: { ...market, quote: { ...market.quote, asset: `${market.quote.network}/erc20:0x${"88".repeat(20)}` } },
      },
    },
    { name: "mutation readiness", health: { ...baseHealth, acceptingMutations: false } },
  ];

  for (const candidate of cases) {
    const paths: string[] = [];
    globalThis.fetch = (async (input) => {
      paths.push((input as URL).pathname);
      return new Response(JSON.stringify(candidate.health), { status: 200 });
    }) as typeof fetch;
    const response = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": "order-one" },
      body: orderBody,
    }), process.env, enabledDeployment);
    assert.equal(response.status, 503, candidate.name);
    assert.deepEqual(paths, ["/health"], candidate.name);
  }
});

test("matcher GET proxies only the loopback health endpoint without caching", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  let requested: URL | undefined;
  let init: RequestInit | undefined;
  globalThis.fetch = (async (input, nextInit) => {
    requested = input as URL;
    init = nextInit;
    return new Response(healthBody, { status: 200 });
  }) as typeof fetch;

  const response = await matcherHealthProxy(process.env, enabledDeployment);
  assert.equal(requested?.toString(), "http://127.0.0.1:8788/health");
  assert.equal(init?.cache, "no-store");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    ok: true,
    matcher: "persistent-native-v1",
    configured: true,
    acceptingMutations: true,
    mode: "no-value",
    custody: false,
    market,
    sequence: "1",
    stateRoot: STATE_ROOT,
    configurationHash: CONFIGURATION_HASH,
    checkpoint,
  });
});

test("matcher GET rejects malformed private health and exposes a strict account lifecycle view", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  globalThis.fetch = (async () => new Response(JSON.stringify({
    ok: true,
    makerAccountId: MAKER_ACCOUNT_ID,
    configurationHash: CONFIGURATION_HASH,
    accountEpoch: "0",
    sequence: "1",
    checkpoint,
    privateSignerBinding: "must-not-cross-the-proxy",
  }))) as typeof fetch;
  const account = await matcherAccountProxy(MAKER_ACCOUNT_ID, process.env, enabledDeployment);
  assert.equal(account.status, 200);
  assert.deepEqual(await account.json(), {
    ok: true,
    makerAccountId: MAKER_ACCOUNT_ID,
    configurationHash: CONFIGURATION_HASH,
    accountEpoch: "0",
    sequence: "1",
    checkpoint,
  });
  assert.equal((await matcherAccountProxy(`0x${"AA".repeat(32)}`, process.env, enabledDeployment)).status, 400);

  globalThis.fetch = (async () => new Response('{"ok":true,"private":"detail"}')) as typeof fetch;
  const malformed = await matcherHealthProxy(process.env, enabledDeployment);
  assert.equal(malformed.status, 503);
  assert.deepEqual(await malformed.json(), { ok: false, reason: "matcher-unavailable", matcher: "in-browser" });
});

test("matcher recovery proxies exact no-store challenge and signature-free order views", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  const challengeValue = `0x${"66".repeat(32)}`;
  const maker = MAKER_ACCOUNT_ID;
  const challengeRequest = {
    version: 1,
    makerAccountId: maker,
    afterSequence: "0",
    limit: 10,
  };
  const requested: Array<{ path: string; init: RequestInit | undefined }> = [];
  globalThis.fetch = (async (input, init) => {
    const path = (input as URL).pathname;
    requested.push({ path, init });
    if (path === "/health") return new Response(healthBody, { status: 200 });
    if (path === "/v1/account-order-challenges") return new Response(JSON.stringify({
      ok: true,
      makerAccountId: maker,
      configurationHash: CONFIGURATION_HASH,
      checkpoint,
      afterSequence: "0",
      limit: 10,
      challenge: challengeValue,
      issuedAtSeconds: "1800000000",
      expiresAtSeconds: "1800000060",
    }), { status: 200 });
    return new Response(JSON.stringify({
      ok: true,
      makerAccountId: maker,
      configurationHash: CONFIGURATION_HASH,
      accountEpoch: "0",
      afterSequence: "0",
      nextAfter: "1",
      hasMore: false,
      checkpoint,
      orders: [{
        version: 1,
        orderHash: SUBJECT_HASH,
        acceptedSequence: "1",
        makerAccountId: maker,
        authorizedSignerId: maker,
        accountEpoch: "0",
        nonce: "7",
        currentStatus: "open",
        baseAmountAtoms: "100000000",
        remainingBaseAtoms: "100000000",
        limitPriceTicks: "650000",
        expiry: "1800000600",
      }],
    }), { status: 200 });
  }) as typeof fetch;

  const challenge = await matcherRecoveryChallengeProxy(new Request("http://localhost/api/matcher/recovery/challenge", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(challengeRequest),
  }), process.env, enabledDeployment);
  assert.equal(challenge.status, 200);
  assert.equal(challenge.headers.get("cache-control"), "no-store");
  assert.equal(requested.at(-1)?.path, "/v1/account-order-challenges");
  assert.equal(new Headers(requested.at(-1)?.init?.headers).get(MATCHER_CONFIGURATION_HEADER), CONFIGURATION_HASH);
  const challengeBody = await challenge.json() as Record<string, unknown>;
  assert.deepEqual(challengeBody, {
    ok: true,
    makerAccountId: maker,
    configurationHash: CONFIGURATION_HASH,
    checkpoint,
    afterSequence: "0",
    limit: 10,
    challenge: challengeValue,
    issuedAtSeconds: "1800000000",
    expiresAtSeconds: "1800000060",
  });

  const proof = {
    version: 1,
    makerAccountId: maker,
    configurationHash: CONFIGURATION_HASH,
    checkpointSequence: "1",
    checkpointRecordHash: RECORD_HASH,
    checkpointStateRoot: STATE_ROOT,
    afterSequence: "0",
    limit: 10,
    challenge: challengeValue,
    expiresAtSeconds: "1800000060",
    signature: `0x${"77".repeat(65)}`,
  };
  const recovery = await matcherRecoveryOrdersProxy(new Request("http://localhost/api/matcher/recovery/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(proof),
  }), process.env, enabledDeployment);
  assert.equal(recovery.status, 200);
  assert.equal(requested.at(-1)?.path, "/v1/account-open-orders");
  const recoveryBody = await recovery.json() as Record<string, unknown>;
  assert.equal(JSON.stringify(recoveryBody).includes("signature"), false);
  assert.equal((recoveryBody.orders as unknown[]).length, 1);
});

test("matcher recovery rejects malformed or widened upstream order views", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  globalThis.fetch = (async (input) => {
    if ((input as URL).pathname === "/health") return new Response(healthBody, { status: 200 });
    return new Response(JSON.stringify({
      ok: true,
      makerAccountId: MAKER_ACCOUNT_ID,
      configurationHash: CONFIGURATION_HASH,
      accountEpoch: "0",
      afterSequence: "0",
      nextAfter: "1",
      hasMore: false,
      checkpoint,
      orders: [{
        version: 1,
        orderHash: SUBJECT_HASH,
        acceptedSequence: "1",
        makerAccountId: MAKER_ACCOUNT_ID,
        authorizedSignerId: MAKER_ACCOUNT_ID,
        accountEpoch: "0",
        nonce: "7",
        currentStatus: "open",
        baseAmountAtoms: "100",
        remainingBaseAtoms: "100",
        limitPriceTicks: "1",
        expiry: "1800000600",
        signature: "must-not-cross",
      }],
    }), { status: 200 });
  }) as typeof fetch;
  const response = await matcherRecoveryOrdersProxy(new Request("http://localhost/api/matcher/recovery/orders", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      version: 1,
      makerAccountId: MAKER_ACCOUNT_ID,
      configurationHash: CONFIGURATION_HASH,
      checkpointSequence: "1",
      checkpointRecordHash: RECORD_HASH,
      checkpointStateRoot: STATE_ROOT,
      afterSequence: "0",
      limit: 10,
      challenge: `0x${"66".repeat(32)}`,
      expiresAtSeconds: "1800000060",
      signature: `0x${"77".repeat(65)}`,
    }),
  }), process.env, enabledDeployment);
  assert.equal(response.status, 503);
});

test("matcher POST rejects invalid transport boundaries before proxying", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("{}", { status: 201 });
  }) as typeof fetch;

  const wrongType = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "text/plain", "idempotency-key": "order-one" },
    body: "{}",
  }), process.env, enabledDeployment);
  assert.equal(wrongType.status, 415);

  const missingKey = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }), process.env, enabledDeployment);
  assert.equal(missingKey.status, 400);
  assert.deepEqual(await missingKey.json(), { ok: false, reason: "idempotency-key-invalid" });

  const invalidKey = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "contains space" },
    body: "{}",
  }), process.env, enabledDeployment);
  assert.equal(invalidKey.status, 400);

  const tooLarge = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "order-one" },
    body: JSON.stringify({ value: "x".repeat(64 * 1024) }),
  }), process.env, enabledDeployment);
  assert.equal(tooLarge.status, 413);

  let cancelled = false;
  const streamedBody = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(40 * 1024));
      controller.enqueue(new Uint8Array(40 * 1024));
    },
    cancel() {
      cancelled = true;
    },
  });
  const streamedTooLarge = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "order-one" },
    body: streamedBody,
    duplex: "half",
  } as RequestInit & { duplex: "half" }), process.env, enabledDeployment);
  assert.equal(streamedTooLarge.status, 413);
  assert.equal(cancelled, true);
  assert.equal(calls, 0);
});

test("matcher POST forwards the exact order endpoint, body, and idempotency key", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://localhost:8788";
  const body = orderBody;
  let requested: URL | undefined;
  let init: RequestInit | undefined;
  globalThis.fetch = (async (input, nextInit) => {
    requested = input as URL;
    init = nextInit;
    if (requested.pathname === "/health") return new Response(healthBody, { status: 200 });
    return new Response(JSON.stringify({
      ok: true,
      replayed: false,
      receipt: {
        version: 1,
        sequence: "1",
        requestId: "order-one",
        commandHash: `0x${"66".repeat(32)}`,
        kind: "accept-order",
        occurredAtSeconds: "1800000000",
        status: "open",
        subjectHash: SUBJECT_HASH,
        remainingBaseAtoms: "100000000",
        swapPlanIds: [],
      },
      receiptCheckpoint: checkpoint,
      checkpoint,
      privateMatcherDetail: "must-not-cross-the-proxy",
    }), { status: 201 });
  }) as typeof fetch;

  const response = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "order-one",
      authorization: "must-not-cross-the-proxy",
    },
    body,
  }), process.env, enabledDeployment);

  assert.equal(requested?.toString(), "http://localhost:8788/v1/orders");
  assert.equal(init?.method, "POST");
  assert.equal(init?.body, body);
  assert.equal(new Headers(init?.headers).get("content-type"), "application/json");
  assert.equal(new Headers(init?.headers).get("idempotency-key"), "order-one");
  assert.equal(new Headers(init?.headers).get(MATCHER_CONFIGURATION_HEADER), CONFIGURATION_HASH);
  assert.equal(new Headers(init?.headers).get("authorization"), null);
  assert.equal(init?.cache, "no-store");
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), {
    ok: true,
    replayed: false,
    receipt: {
      version: 1,
      sequence: "1",
      requestId: "order-one",
      kind: "accept-order",
      status: "open",
      subjectHash: SUBJECT_HASH,
      occurredAtSeconds: "1800000000",
    },
    receiptCheckpoint: checkpoint,
    checkpoint,
  });
});

test("matcher control actions forward only their exact endpoint and bind the returned receipt", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://localhost:8788";
  const cases = [
    {
      action: "cancel-order" as const,
      requestId: "cancel-one",
      body: cancellationBody,
      endpoint: "/v1/order-cancellations",
      status: "cancelled",
      subjectHash: SUBJECT_HASH,
    },
    {
      action: "advance-epoch" as const,
      requestId: "epoch-one",
      body: epochBody,
      endpoint: "/v1/account-epochs",
      status: "epoch-advanced",
      subjectHash: MAKER_ACCOUNT_ID,
    },
  ];

  for (const candidate of cases) {
    const requests: Array<Readonly<{ url: URL; init: RequestInit | undefined }>> = [];
    globalThis.fetch = (async (input, init) => {
      const url = input as URL;
      requests.push({ url, init });
      if (url.pathname === "/health") return new Response(healthBody, { status: 200 });
      return new Response(JSON.stringify({
        ok: true,
        replayed: false,
        receipt: {
          version: 1,
          sequence: "2",
          requestId: candidate.requestId,
          kind: candidate.action,
          status: candidate.status,
          subjectHash: candidate.subjectHash,
          occurredAtSeconds: "1800000003",
          privateMatcherDetail: "must-not-cross-the-proxy",
        },
        receiptCheckpoint: { ...checkpoint, sequence: "2" },
        checkpoint: { ...checkpoint, sequence: "2" },
      }), { status: 201 });
    }) as typeof fetch;

    const response = await matcherMutationProxy(new Request("http://localhost/api/matcher", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": candidate.requestId,
        authorization: "must-not-cross-the-proxy",
      },
      body: candidate.body,
    }), candidate.action, process.env, enabledDeployment);

    assert.deepEqual(requests.map(({ url }) => url.pathname), ["/health", candidate.endpoint], candidate.action);
    const forwarded = requests[1]?.init;
    assert.equal(forwarded?.body, candidate.body, candidate.action);
    assert.equal(new Headers(forwarded?.headers).get("idempotency-key"), candidate.requestId, candidate.action);
    assert.equal(new Headers(forwarded?.headers).get(MATCHER_CONFIGURATION_HEADER), CONFIGURATION_HASH, candidate.action);
    assert.equal(new Headers(forwarded?.headers).get("authorization"), null, candidate.action);
    assert.equal(response.status, 201, candidate.action);
    assert.deepEqual(await response.json(), {
      ok: true,
      replayed: false,
      receipt: {
        version: 1,
        sequence: "2",
        requestId: candidate.requestId,
        kind: candidate.action,
        status: candidate.status,
        subjectHash: candidate.subjectHash,
        occurredAtSeconds: "1800000003",
      },
      receiptCheckpoint: { ...checkpoint, sequence: "2" },
      checkpoint: { ...checkpoint, sequence: "2" },
    }, candidate.action);
  }
});

test("matcher proxy preserves an accepted receipt checkpoint when an idempotent replay observes a newer head", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://localhost:8788";
  const currentCheckpoint = {
    ...checkpoint,
    sequence: "3",
    recordHash: `0x${"77".repeat(32)}`,
    stateRoot: `0x${"88".repeat(32)}`,
  };
  globalThis.fetch = (async (input) => (input as URL).pathname === "/health"
    ? new Response(healthBody, { status: 200 })
    : new Response(JSON.stringify({
      ok: true,
      replayed: true,
      receipt: {
        version: 1,
        sequence: "1",
        requestId: "order-one",
        kind: "accept-order",
        status: "open",
        subjectHash: SUBJECT_HASH,
        occurredAtSeconds: "1800000000",
      },
      receiptCheckpoint: checkpoint,
      checkpoint: currentCheckpoint,
    }), { status: 200 })) as typeof fetch;

  const response = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "order-one" },
    body: orderBody,
  }), process.env, enabledDeployment);

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    ok: true,
    replayed: true,
    receipt: {
      version: 1,
      sequence: "1",
      requestId: "order-one",
      kind: "accept-order",
      status: "open",
      subjectHash: SUBJECT_HASH,
      occurredAtSeconds: "1800000000",
    },
    receiptCheckpoint: checkpoint,
    checkpoint: currentCheckpoint,
  });
});

test("matcher control proxy rejects a receipt for a different signed subject", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://localhost:8788";
  for (const [action, requestId, body, status] of [
    ["cancel-order", "cancel-one", cancellationBody, "cancelled"],
    ["advance-epoch", "epoch-one", epochBody, "epoch-advanced"],
  ] as const) {
    globalThis.fetch = (async (input) => (input as URL).pathname === "/health"
      ? new Response(healthBody, { status: 200 })
      : new Response(JSON.stringify({
        ok: true,
        replayed: false,
        receipt: {
          version: 1,
          sequence: "2",
          requestId,
          kind: action,
          status,
          subjectHash: `0x${"99".repeat(32)}`,
          occurredAtSeconds: "1800000003",
        },
        receiptCheckpoint: { ...checkpoint, sequence: "2" },
        checkpoint: { ...checkpoint, sequence: "2" },
      }), { status: 201 })) as typeof fetch;

    const response = await matcherMutationProxy(new Request("http://localhost/api/matcher", {
      method: "POST",
      headers: { "content-type": "application/json", "idempotency-key": requestId },
      body,
    }), action, process.env, enabledDeployment);
    assert.equal(response.status, 503, action);
  }
});

test("matcher POST maps private rejections and malformed success bodies to fixed errors", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  const request = () => new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "order-one" },
    body: orderBody,
  });
  globalThis.fetch = (async (input) => (input as URL).pathname === "/health"
    ? new Response(healthBody, { status: 200 })
    : new Response('{"reason":"private verifier stack"}', { status: 422 })) as typeof fetch;
  const rejected = await matcherOrderProxy(request(), process.env, enabledDeployment);
  assert.equal(rejected.status, 422);
  assert.deepEqual(await rejected.json(), { ok: false, reason: "matcher-rejected-order" });

  globalThis.fetch = (async (input) => (input as URL).pathname === "/health"
    ? new Response(healthBody, { status: 200 })
    : new Response('{"ok":true,"private":"detail"}', { status: 201 })) as typeof fetch;
  const malformed = await matcherOrderProxy(request(), process.env, enabledDeployment);
  assert.equal(malformed.status, 503);
  assert.deepEqual(await malformed.json(), { ok: false, reason: "matcher-unavailable", matcher: "in-browser" });

  const staleConfigurationHash = `0x${"99".repeat(32)}`;
  globalThis.fetch = (async (input) => (input as URL).pathname === "/health"
    ? new Response(healthBody, { status: 200 })
    : new Response(JSON.stringify({
      ok: true,
      replayed: false,
      receipt: {
        version: 1,
        sequence: "1",
        requestId: "order-one",
        kind: "accept-order",
        status: "open",
        subjectHash: SUBJECT_HASH,
        occurredAtSeconds: "1800000000",
      },
      receiptCheckpoint: checkpoint,
      checkpoint: { ...checkpoint, configurationHash: staleConfigurationHash },
    }), { status: 201 })) as typeof fetch;
  const staleReceipt = await matcherOrderProxy(request(), process.env, enabledDeployment);
  assert.equal(staleReceipt.status, 503);

  globalThis.fetch = (async (input) => (input as URL).pathname === "/health"
    ? new Response(healthBody, { status: 200 })
    : new Response(JSON.stringify({
      ok: true,
      replayed: true,
      receipt: {
        version: 1,
        sequence: "1",
        requestId: "order-one",
        kind: "accept-order",
        status: "open",
        subjectHash: SUBJECT_HASH,
        occurredAtSeconds: "1800000000",
      },
      receiptCheckpoint: checkpoint,
      checkpoint: { ...checkpoint, stateRoot: `0x${"11".repeat(32)}` },
    }), { status: 200 })) as typeof fetch;
  const conflictingCheckpoint = await matcherOrderProxy(request(), process.env, enabledDeployment);
  assert.equal(conflictingCheckpoint.status, 503);
});

test("the proxy proves its hop and forwards the edge-established client identity", async () => {
  // review-2: every proxied request previously arrived at the matcher from
  // one loopback socket, so all clients shared one rate-limit bucket. The
  // proxy now proves its hop with an operator-configured key and passes the
  // client identity it observed, which the matcher trusts only for that hop.
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  process.env.PHLEBAS_MATCHER_PROXY_KEY = "proxy-hop-key-0123456789abcdef";
  const captured: Array<Record<string, string>> = [];
  globalThis.fetch = (async (_input, init) => {
    captured.push(Object.fromEntries(new Headers(init?.headers).entries()));
    return new Response(healthBody, { status: 200 });
  }) as typeof fetch;

  await matcherMutationProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "order-one",
      "x-forwarded-for": "203.0.113.1, 10.0.0.1",
      "x-phlebas-proxy-auth": "client-forged-key-0123456789",
      "x-phlebas-forwarded-for": "203.0.113.99",
    },
    body: orderBody,
  }), "accept-order", process.env, enabledDeployment);

  assert.equal(captured.length, 2);
  const mutationHeaders = captured[1]!;
  assert.equal(mutationHeaders["x-phlebas-proxy-auth"], "proxy-hop-key-0123456789abcdef");
  assert.equal(mutationHeaders["x-phlebas-forwarded-for"], "203.0.113.1");
});

test("without a configured hop key the proxy forwards no identity headers", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  delete process.env.PHLEBAS_MATCHER_PROXY_KEY;
  const captured: Array<Record<string, string>> = [];
  globalThis.fetch = (async (_input, init) => {
    captured.push(Object.fromEntries(new Headers(init?.headers).entries()));
    return new Response(healthBody, { status: 200 });
  }) as typeof fetch;

  await matcherMutationProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "order-one",
      "x-forwarded-for": "203.0.113.1",
      "x-phlebas-proxy-auth": "client-forged-key-0123456789",
    },
    body: orderBody,
  }), "accept-order", process.env, enabledDeployment);

  assert.equal(captured.length, 2);
  for (const headers of captured) {
    assert.equal(headers["x-phlebas-proxy-auth"], undefined);
    assert.equal(headers["x-phlebas-forwarded-for"], undefined);
  }
});
