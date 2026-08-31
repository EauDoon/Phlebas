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

export function extractClientKey(request: IncomingMessage): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    const first = forwarded.split(",")[0];
    if (first !== undefined && first.trim().length > 0) return first.trim();
  }
  const realIp = request.headers["x-real-ip"];
  if (typeof realIp === "string" && realIp.length > 0) return realIp;
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
