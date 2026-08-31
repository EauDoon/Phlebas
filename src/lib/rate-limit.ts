// Per-key token bucket rate limiter. The limiter is a pure
// function over a state record; the limiter never reaches out to
// the network and never signs a transaction. The limiter is the
// building block for the public market data surface's per-IP
// rate limit. The limiter is deterministic for a fixed clock.

export type RateLimitConfig = Readonly<{
  capacity: bigint;
  refillPerSecond: bigint;
}>;

export type RateLimitKey = string;

export type RateLimitState = Readonly<Record<RateLimitKey, { tokens: bigint; lastRefillAt: bigint }>>;

export function emptyRateLimitState(): RateLimitState {
  return {};
}

export function takeTokens(
  state: RateLimitState,
  config: RateLimitConfig,
  key: RateLimitKey,
  nowSeconds: bigint,
  requested: bigint = 1n,
): { allowed: boolean; state: RateLimitState; remaining: bigint } {
  if (config.capacity <= 0n) throw new RangeError("Capacity must be positive");
  if (config.refillPerSecond <= 0n) throw new RangeError("Refill rate must be positive");
  if (requested <= 0n) throw new RangeError("Requested tokens must be positive");
  if (nowSeconds < 0n) throw new RangeError("Now must be non-negative");

  const current = state[key] ?? { tokens: config.capacity, lastRefillAt: nowSeconds };
  const elapsed = nowSeconds - current.lastRefillAt;
  const refilled = elapsed <= 0n
    ? current.tokens
    : current.tokens + elapsed * config.refillPerSecond;
  const capped = refilled > config.capacity ? config.capacity : refilled;
  if (capped < requested) {
    const next = { ...state, [key]: { tokens: capped, lastRefillAt: nowSeconds } };
    return { allowed: false, state: next, remaining: capped };
  }
  const remaining = capped - requested;
  const next = { ...state, [key]: { tokens: remaining, lastRefillAt: nowSeconds } };
  return { allowed: true, state: next, remaining };
}

export function resetKey(state: RateLimitState, key: RateLimitKey): RateLimitState {
  const next = { ...state };
  delete next[key];
  return next;
}
