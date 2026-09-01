import assert from "node:assert/strict";
import test from "node:test";

import { matcherHealthProxy, matcherOrderProxy } from "./matcher-proxy.ts";

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

test("matcher GET proxies only the loopback health endpoint without caching", async () => {
  process.env.PHLEBAS_MATCHER_URL = "http://127.0.0.1:8788";
  let requested: URL | undefined;
  let init: RequestInit | undefined;
  globalThis.fetch = (async (input, nextInit) => {
    requested = input as URL;
    init = nextInit;
    return new Response('{"ok":true}', { status: 200 });
  }) as typeof fetch;

  const response = await matcherHealthProxy();
  assert.equal(requested?.toString(), "http://127.0.0.1:8788/health");
  assert.equal(init?.cache, "no-store");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true });
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
  }));
  assert.equal(wrongType.status, 415);

  const missingKey = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{}",
  }));
  assert.equal(missingKey.status, 400);
  assert.deepEqual(await missingKey.json(), { ok: false, reason: "idempotency-key-invalid" });

  const invalidKey = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "contains space" },
    body: "{}",
  }));
  assert.equal(invalidKey.status, 400);

  const tooLarge = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: { "content-type": "application/json", "idempotency-key": "order-one" },
    body: JSON.stringify({ value: "x".repeat(64 * 1024) }),
  }));
  assert.equal(tooLarge.status, 413);
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
    return new Response('{"ok":true,"replayed":false}', { status: 201 });
  }) as typeof fetch;

  const response = await matcherOrderProxy(new Request("http://localhost/api/matcher", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "idempotency-key": "order-one",
      authorization: "must-not-cross-the-proxy",
    },
    body,
  }));

  assert.equal(requested?.toString(), "http://localhost:8788/v1/orders");
  assert.equal(init?.method, "POST");
  assert.equal(init?.body, body);
  assert.equal(new Headers(init?.headers).get("content-type"), "application/json");
  assert.equal(new Headers(init?.headers).get("idempotency-key"), "order-one");
  assert.equal(new Headers(init?.headers).get("authorization"), null);
  assert.equal(init?.cache, "no-store");
  assert.equal(response.status, 201);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { ok: true, replayed: false });
});
