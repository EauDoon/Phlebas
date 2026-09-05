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

test("extractClientKey ignores forwarding headers unless a proxy is trusted", () => {
  // These are request headers like any other. Reading them by default let
  // a caller mint a fresh bucket per request and bypass the limiter
  // outright, on servers that PHLEBAS_ALLOW_NON_LOOPBACK=1 can expose.
  const spoofed = mkRequest({ "x-forwarded-for": "203.0.113.1", "x-real-ip": "198.51.100.5" }, "10.0.0.9");
  assert.equal(extractClientKey(spoofed), "10.0.0.9");
  assert.equal(extractClientKey(spoofed, {}), "10.0.0.9");
  assert.equal(extractClientKey(spoofed, { trustForwardedHeaders: false }), "10.0.0.9");
});

test("extractClientKey prefers the first X-Forwarded-For address when the proxy is trusted", () => {
  const req = mkRequest({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" });
  assert.equal(extractClientKey(req, { trustForwardedHeaders: true }), "203.0.113.1");
});

test("extractClientKey falls back to X-Real-IP when the proxy is trusted", () => {
  const req = mkRequest({ "x-real-ip": "198.51.100.5" });
  assert.equal(extractClientKey(req, { trustForwardedHeaders: true }), "198.51.100.5");
});

test("extractClientKey falls back to the socket remote address", () => {
  const req = mkRequest({}, "192.0.2.10");
  assert.equal(extractClientKey(req), "192.0.2.10");
});

test("a matching proxy hop key trusts the proxy-established client header", () => {
  const req = mkRequest({
    "x-phlebas-proxy-auth": "hop-secret-key-0123456789",
    "x-phlebas-forwarded-for": "203.0.113.7",
  }, "10.0.0.9");
  assert.equal(extractClientKey(req, { trustedProxyKeys: ["hop-secret-key-0123456789"] }), "203.0.113.7");
});

test("a wrong or missing hop key cannot mint client identities", () => {
  const configured = { trustedProxyKeys: ["hop-secret-key-0123456789"] };
  const wrongKey = mkRequest({
    "x-phlebas-proxy-auth": "wrong-key-0123456789abcdefgh",
    "x-phlebas-forwarded-for": "203.0.113.7",
  }, "10.0.0.9");
  assert.equal(extractClientKey(wrongKey, configured), "10.0.0.9");
  const noKey = mkRequest({ "x-phlebas-forwarded-for": "203.0.113.7" }, "10.0.0.9");
  assert.equal(extractClientKey(noKey, configured), "10.0.0.9");
  // Array-valued headers are not identities either.
  const arrayHeader = mkRequest({
    "x-phlebas-proxy-auth": "hop-secret-key-0123456789",
    "x-phlebas-forwarded-for": ["203.0.113.7"],
  }, "10.0.0.9");
  assert.equal(extractClientKey(arrayHeader, configured), "10.0.0.9");
});

test("unbounded or control-bearing forwarded identities fail closed", () => {
  const configured = { trustedProxyKeys: ["hop-secret-key-0123456789"] };
  const tooLong = mkRequest({
    "x-phlebas-proxy-auth": "hop-secret-key-0123456789",
    "x-phlebas-forwarded-for": `${"a".repeat(65)}`,
  }, "10.0.0.9");
  assert.equal(extractClientKey(tooLong, configured), "10.0.0.9");
  const control = mkRequest({
    "x-phlebas-proxy-auth": "hop-secret-key-0123456789",
    "x-phlebas-forwarded-for": "203.0.113.7\n203.0.113.8",
  }, "10.0.0.9");
  assert.equal(extractClientKey(control, configured), "10.0.0.9");
});

test("without configured proxy keys the hop headers are inert", () => {
  const req = mkRequest({
    "x-phlebas-proxy-auth": "hop-secret-key-0123456789",
    "x-phlebas-forwarded-for": "203.0.113.7",
  }, "10.0.0.9");
  assert.equal(extractClientKey(req), "10.0.0.9");
  assert.equal(extractClientKey(req, { trustedProxyKeys: [] }), "10.0.0.9");
});

test("any one of several configured hop keys authenticates the hop", () => {
  const req = mkRequest({
    "x-phlebas-proxy-auth": "second-hop-key-0123456789abcdef",
    "x-phlebas-forwarded-for": "198.51.100.9",
  }, "10.0.0.9");
  assert.equal(
    extractClientKey(req, { trustedProxyKeys: ["hop-secret-key-0123456789", "second-hop-key-0123456789abcdef"] }),
    "198.51.100.9",
  );
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
