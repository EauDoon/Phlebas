import assert from "node:assert/strict";
import test from "node:test";

import { isLoopbackOperatorUrl } from "./operator-url.ts";

test("operator URLs must be loopback HTTP with no path, user, or TLS", () => {
  assert.equal(isLoopbackOperatorUrl("http://127.0.0.1:8787"), true);
  assert.equal(isLoopbackOperatorUrl("http://localhost:8788"), true);
  assert.equal(isLoopbackOperatorUrl("http://[::1]:8789"), true);
  assert.equal(isLoopbackOperatorUrl(undefined), false);
  assert.equal(isLoopbackOperatorUrl(""), false);
  assert.equal(isLoopbackOperatorUrl("https://127.0.0.1:8787"), false);
  assert.equal(isLoopbackOperatorUrl("http://example.com:8787"), false);
  assert.equal(isLoopbackOperatorUrl("http://0.0.0.0:8787"), false);
  assert.equal(isLoopbackOperatorUrl("http://127.0.0.1:8787/intents"), false);
  assert.equal(isLoopbackOperatorUrl("http://user:pass@127.0.0.1:8787"), false);
  assert.equal(isLoopbackOperatorUrl("http://127.0.0.1:8787/?next=1"), false);
  assert.equal(isLoopbackOperatorUrl("http://127.0.0.1:8787/#frag"), false);
});

test("direct processes refuse 0.0.0.0 unless Compose allows it", async () => {
  const { listenHost } = await import("./operator-url.ts");
  assert.equal(listenHost("127.0.0.1"), "127.0.0.1");
  assert.equal(listenHost(undefined, {}), "127.0.0.1");
  assert.throws(() => listenHost("0.0.0.0", {}), /loopback only/);
  assert.throws(() => listenHost("::", {}), /loopback only/);
  assert.throws(() => listenHost("192.0.2.10", {}), /loopback only/);
  assert.equal(listenHost("192.0.2.10", { PHLEBAS_ALLOW_NON_LOOPBACK: "1" }), "192.0.2.10");
  assert.equal(listenHost("0.0.0.0", { PHLEBAS_ALLOW_NON_LOOPBACK: "1" }), "0.0.0.0");
  assert.equal(listenHost("::", { PHLEBAS_ALLOW_NON_LOOPBACK: "1" }), "::");
});

test("operator unavailable helper is a 503 with no-store", async () => {
  const { operatorUnavailable } = await import("./operator-url.ts");
  const response = operatorUnavailable("gateway-unavailable");
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const body = await response.json() as { ok: boolean; reason: string };
  assert.equal(body.ok, false);
  assert.equal(body.reason, "gateway-unavailable");
});

test("loopback operator fetches preserve bounded responses and hide transport failures", async () => {
  const { fetchLoopbackOperator } = await import("./operator-url.ts");
  let received: RequestInit | undefined;
  const success = await fetchLoopbackOperator(
    new URL("http://127.0.0.1:8787/health"),
    { method: "POST" },
    async (_input, init) => {
      received = init;
      return new Response('{"ok":true}', { status: 202 });
    },
  );
  assert.deepEqual(success, { body: '{"ok":true}', status: 202 });
  assert.equal(received?.method, "POST");
  assert.equal(received?.cache, "no-store");
  assert.ok(received?.signal instanceof AbortSignal);

  const failed = await fetchLoopbackOperator(
    new URL("http://127.0.0.1:8787/health"),
    {},
    async () => { throw new Error("private operator failure"); },
  );
  assert.equal(failed, undefined);
});
