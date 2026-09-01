import assert from "node:assert/strict";
import test from "node:test";

import {
  matcherAccountProxy,
  matcherHealthProxy,
  matcherOrderProxy,
  type MatcherIngressDeployment,
} from "./matcher-proxy.ts";

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
    network: "eip155:42161",
    asset: "eip155:42161/erc20:0xaf88d065e77c8cc2239327c5edb3a432268e5831",
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
const originalFetch = globalThis.fetch;

test.afterEach(() => {
  if (originalMatcherUrl === undefined) delete process.env.PHLEBAS_MATCHER_URL;
  else process.env.PHLEBAS_MATCHER_URL = originalMatcherUrl;
  globalThis.fetch = originalFetch;
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

test("matcher POST requires the approved runtime configuration before forwarding an order", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  const mismatchedHash = `0x${"77".repeat(32)}`;
  const paths: string[] = [];
  globalThis.fetch = (async (input) => {
    paths.push((input as URL).pathname);
    return new Response(JSON.stringify({
      ...JSON.parse(healthBody),
      configurationHash: mismatchedHash,
      checkpoint: { ...checkpoint, configurationHash: mismatchedHash },
    }), { status: 200 });
  }) as typeof fetch;

  const response = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "order-one" },
    body: "{}",
  }), process.env, enabledDeployment);
  assert.equal(response.status, 503);
  assert.deepEqual(paths, ["/health"]);
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

  const response = await matcherHealthProxy();
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
  const account = await matcherAccountProxy(MAKER_ACCOUNT_ID);
  assert.equal(account.status, 200);
  assert.deepEqual(await account.json(), {
    ok: true,
    makerAccountId: MAKER_ACCOUNT_ID,
    configurationHash: CONFIGURATION_HASH,
    accountEpoch: "0",
    sequence: "1",
    checkpoint,
  });
  assert.equal((await matcherAccountProxy(`0x${"AA".repeat(32)}`)).status, 400);

  globalThis.fetch = (async () => new Response('{"ok":true,"private":"detail"}')) as typeof fetch;
  const malformed = await matcherHealthProxy();
  assert.equal(malformed.status, 503);
  assert.deepEqual(await malformed.json(), { ok: false, reason: "matcher-unavailable", matcher: "in-browser" });
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
  const body = '{"version":1,"requestId":"order-one"}';
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
    checkpoint,
  });
});

test("matcher POST maps private rejections and malformed success bodies to fixed errors", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  const request = () => new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "order-one" },
    body: '{"version":1,"requestId":"order-one"}',
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
});
