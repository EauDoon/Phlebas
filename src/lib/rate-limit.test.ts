import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  emptyRateLimitState,
  resetKey,
  takeTokens,
  type RateLimitConfig,
} from "./rate-limit.ts";

const config: RateLimitConfig = { capacity: 5n, refillPerSecond: 1n };

test("takeTokens allows the first request up to capacity", () => {
  let state = emptyRateLimitState();
  const r1 = takeTokens(state, config, "ip:1.2.3.4", 100n);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 4n);
  state = r1.state;
  const r2 = takeTokens(state, config, "ip:1.2.3.4", 100n);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 3n);
});

test("takeTokens rejects a request that exceeds capacity", () => {
  let state = emptyRateLimitState();
  for (let i = 0; i < 5; i++) {
    state = takeTokens(state, config, "ip:5.6.7.8", 100n).state;
  }
  const r = takeTokens(state, config, "ip:5.6.7.8", 100n);
  assert.equal(r.allowed, false);
  assert.equal(r.remaining, 0n);
});

test("takeTokens refills tokens as time advances", () => {
  let state = emptyRateLimitState();
  for (let i = 0; i < 5; i++) {
    state = takeTokens(state, config, "ip:1.1.1.1", 100n).state;
  }
  // 5 seconds later, capacity (5) is refilled. Take 1, leave 4.
  const r = takeTokens(state, config, "ip:1.1.1.1", 105n);
  assert.equal(r.allowed, true);
  assert.equal(r.remaining, 4n);
  state = r.state;
  // 1 more second, 1 token refilled on top of 4 = 5, take 1, leave 4.
  const r2 = takeTokens(state, config, "ip:1.1.1.1", 106n);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 4n);
  state = r2.state;
  // 0 seconds later, no refill, take 1, leave 3.
  const r3 = takeTokens(state, config, "ip:1.1.1.1", 106n);
  assert.equal(r3.allowed, true);
  assert.equal(r3.remaining, 3n);
  state = r3.state;
  // drain to 0
  for (let i = 0; i < 3; i++) {
    state = takeTokens(state, config, "ip:1.1.1.1", 106n).state;
  }
  // one more take should be rejected
  const r4 = takeTokens(state, config, "ip:1.1.1.1", 106n);
  assert.equal(r4.allowed, false);
});

test("takeTokens caps refill at capacity", () => {
  let state = emptyRateLimitState();
  state = takeTokens(state, config, "ip:2.2.2.2", 100n).state;
  state = takeTokens(state, config, "ip:2.2.2.2", 100n).state;
  const r = takeTokens(state, config, "ip:2.2.2.2", 1_000_000n);
  assert.equal(r.allowed, true);
  assert.equal(r.remaining, 4n);
});

test("takeTokens rejects a non-positive config or request", () => {
  assert.throws(() => takeTokens(emptyRateLimitState(), { capacity: 0n, refillPerSecond: 1n }, "k", 0n));
  assert.throws(() => takeTokens(emptyRateLimitState(), { capacity: 1n, refillPerSecond: 0n }, "k", 0n));
  assert.throws(() => takeTokens(emptyRateLimitState(), config, "k", 0n, 0n));
  assert.throws(() => takeTokens(emptyRateLimitState(), config, "k", -1n));
});

test("takeTokens rejects a negative now", () => {
  assert.throws(() => takeTokens(emptyRateLimitState(), config, "k", -1n));
});

test("resetKey clears a single key without touching the rest", () => {
  let state = emptyRateLimitState();
  state = takeTokens(state, config, "ip:a", 100n).state;
  state = takeTokens(state, config, "ip:b", 100n).state;
  const reset = resetKey(state, "ip:a");
  assert.equal(reset["ip:a"], undefined);
  assert.ok(reset["ip:b"]);
});
