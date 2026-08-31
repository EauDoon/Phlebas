import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  checkRateLimit,
  emptyRateLimitMiddleware,
  extractClientKey,
} from "./rate-limit-http.ts";
import type { IncomingMessage } from "node:http";

function mkRequest(headers: Record<string, string | string[] | undefined>, remoteAddress?: string): IncomingMessage {
  return {
    headers,
    socket: { remoteAddress },
  } as unknown as IncomingMessage;
}

test("extractClientKey prefers the first X-Forwarded-For address", () => {
  const req = mkRequest({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" });
  assert.equal(extractClientKey(req), "203.0.113.1");
});

test("extractClientKey falls back to X-Real-IP", () => {
  const req = mkRequest({ "x-real-ip": "198.51.100.5" });
  assert.equal(extractClientKey(req), "198.51.100.5");
});

test("extractClientKey falls back to the socket remote address", () => {
  const req = mkRequest({}, "192.0.2.10");
  assert.equal(extractClientKey(req), "192.0.2.10");
});

test("extractClientKey returns unknown when no address is available", () => {
  const req = mkRequest({}, undefined);
  assert.equal(extractClientKey(req), "unknown");
});

test("checkRateLimit allows the first request up to capacity", () => {
  const mw = emptyRateLimitMiddleware({ capacity: 3n, refillPerSecond: 1n });
  const r1 = checkRateLimit(mw, "ip:1", 100n);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2n);
  const r2 = checkRateLimit({ state: r1.state, config: mw.config }, "ip:1", 100n);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 1n);
});

test("checkRateLimit rejects when capacity is exhausted", () => {
  let mw = emptyRateLimitMiddleware({ capacity: 2n, refillPerSecond: 1n });
  mw = { state: checkRateLimit(mw, "ip:1", 100n).state, config: mw.config };
  mw = { state: checkRateLimit(mw, "ip:1", 100n).state, config: mw.config };
  const r3 = checkRateLimit(mw, "ip:1", 100n);
  assert.equal(r3.allowed, false);
  assert.equal(r3.remaining, 0n);
  assert.ok(r3.retryAfterSeconds >= 1n);
});

test("checkRateLimit refills tokens as time advances", () => {
  let mw = emptyRateLimitMiddleware({ capacity: 2n, refillPerSecond: 1n });
  mw = { state: checkRateLimit(mw, "ip:1", 100n).state, config: mw.config };
  mw = { state: checkRateLimit(mw, "ip:1", 100n).state, config: mw.config };
  // 3 seconds elapsed: 3 tokens refilled, capped at 2. Take 1, leave 1.
  const r = checkRateLimit(mw, "ip:1", 103n);
  assert.equal(r.allowed, true);
  assert.equal(r.remaining, 1n);
});

test("checkRateLimit keeps per-key buckets independent", () => {
  let mw = emptyRateLimitMiddleware({ capacity: 1n, refillPerSecond: 1n });
  mw = { state: checkRateLimit(mw, "ip:a", 100n).state, config: mw.config };
  const r1 = checkRateLimit(mw, "ip:a", 100n);
  assert.equal(r1.allowed, false);
  const r2 = checkRateLimit(mw, "ip:b", 100n);
  assert.equal(r2.allowed, true);
});
