// HTTP rate limiter middleware. The middleware extracts a per-key
// identifier from the request (default: client IP), runs the
// per-key token bucket, and either forwards the request or
// returns 429. The middleware is a pure function; the middleware
// never reaches out to the network and never signs a transaction.

import type { IncomingMessage } from "node:http";
import {
  emptyRateLimitState,
  takeTokens,
  type RateLimitConfig,
  type RateLimitState,
} from "./rate-limit.ts";

export type RateLimitMiddleware = Readonly<{
  state: RateLimitState;
  config: RateLimitConfig;
}>;

export function emptyRateLimitMiddleware(config: RateLimitConfig): RateLimitMiddleware {
  return { state: emptyRateLimitState(), config };
}

/**
 * Default ceiling on retained per-key buckets. A bucket is roughly 100
 * bytes, so this bounds the limiter's own footprint well below the point
 * where it becomes the cheapest thing on the host to exhaust.
 */
export const DEFAULT_RATE_LIMIT_ENTRIES = 10_000;

/**
 * Drop buckets that have refilled to capacity and, past `maximumEntries`,
 * the least recently seen of what remains.
 *
 * The limiter's state is a plain record keyed by client key, and takeTokens
 * copies the whole record on every request. Without a bound, a caller that
 * varies its key per request makes the limiter's own cost grow linearly in
 * the number of keys it has ever seen, so the control meant to cap request
 * cost becomes the thing that amplifies it. Every server that runs the
 * limiter has to call this on the way in.
 *
 * Dropping a bucket that has refilled to capacity is not a concession: a
 * full bucket is indistinguishable from a key that has never been seen.
 */
export function pruneRateLimitMiddleware(
  middleware: RateLimitMiddleware,
  nowSeconds: bigint,
  maximumEntries: number = DEFAULT_RATE_LIMIT_ENTRIES,
): RateLimitMiddleware {
  const idleSeconds = middleware.config.capacity / middleware.config.refillPerSecond + 1n;
  const active = Object.entries(middleware.state)
    .filter(([, bucket]) => nowSeconds < bucket.lastRefillAt + idleSeconds)
    .sort((left, right) => left[1].lastRefillAt < right[1].lastRefillAt ? -1
      : left[1].lastRefillAt > right[1].lastRefillAt ? 1 : left[0].localeCompare(right[0]));
  const retained = active.length > maximumEntries ? active.slice(active.length - maximumEntries) : active;
  return {
    config: middleware.config,
    state: Object.fromEntries(retained),
  };
}

export type ClientKeyOptions = Readonly<{
  /**
   * Read the client address from X-Forwarded-For or X-Real-IP.
   *
   * Off by default, and it has to stay off unless every request reaches
   * this server through a proxy that *overwrites* those headers. They are
   * request headers like any other: a caller that can reach the port can
   * set them, and a caller that varies one per request gets a fresh
   * bucket every time, which is a complete bypass of the limiter rather
   * than a weakening of it. Both servers here bind loopback by default,
   * but PHLEBAS_ALLOW_NON_LOOPBACK=1 exists and there is no proxy in
   * front of them that sanitises the header.
   */
  trustForwardedHeaders?: boolean;
}>;

export function extractClientKey(request: IncomingMessage, options: ClientKeyOptions = {}): string {
  if (options.trustForwardedHeaders === true) {
    const forwarded = request.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
      const first = forwarded.split(",")[0];
      if (first !== undefined && first.trim().length > 0) return first.trim();
    }
    const realIp = request.headers["x-real-ip"];
    if (typeof realIp === "string" && realIp.length > 0) return realIp;
  }
  return request.socket.remoteAddress ?? "unknown";
}

export type RateLimitResult = Readonly<{
  allowed: boolean;
  state: RateLimitState;
  remaining: bigint;
  retryAfterSeconds: bigint;
}>;

export function checkRateLimit(
  middleware: RateLimitMiddleware,
  key: string,
  nowSeconds: bigint,
  requested: bigint = 1n,
): RateLimitResult {
  const result = takeTokens(middleware.state, middleware.config, key, nowSeconds, requested);
  if (result.allowed) {
    return {
      allowed: true,
      state: result.state,
      remaining: result.remaining,
      retryAfterSeconds: 0n,
    };
  }
  const refillPerSecond = middleware.config.refillPerSecond;
  if (refillPerSecond <= 0n) {
    return { allowed: false, state: result.state, remaining: result.remaining, retryAfterSeconds: 1n };
  }
  const deficit = requested - result.remaining;
  const retryAfter = deficit <= 0n ? 1n : (deficit + refillPerSecond - 1n) / refillPerSecond;
  return { allowed: false, state: result.state, remaining: result.remaining, retryAfterSeconds: retryAfterSecondsSafe(retryAfter) };
}

function retryAfterSecondsSafe(value: bigint): bigint {
  return value < 0n ? 0n : value;
}

export type RateLimitResponseLike = Readonly<{
  setHeader: (name: string, value: string | number | string[]) => void;
  statusCode?: number;
  end: (body?: string) => void;
}>;

export function sendRateLimitHeaders(response: RateLimitResponseLike, remaining: bigint, retryAfterSeconds: bigint): void {
  response.setHeader("X-RateLimit-Remaining", remaining.toString());
  if (retryAfterSeconds > 0n) {
    response.setHeader("Retry-After", retryAfterSeconds.toString());
  }
}

export function sendRateLimitExceeded(
  response: RateLimitResponseLike,
  remaining: bigint,
  retryAfterSeconds: bigint,
): void {
  (response as { statusCode?: number }).statusCode = 429;
  sendRateLimitHeaders(response, remaining, retryAfterSeconds);
  response.setHeader("content-type", "application/json");
  response.end(JSON.stringify({ ok: false, reason: "rate-limit-exceeded" }));
}
