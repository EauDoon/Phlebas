import { strict as assert } from "node:assert";
import { test } from "node:test";

import { takeTokens, emptyRateLimitState, type RateLimitConfig } from "./rate-limit.ts";

const config: RateLimitConfig = { capacity: 3n, refillPerSecond: 1n };

test("takeTokens keeps per-key buckets independent", () => {
  let state = emptyRateLimitState();
  // Drain key A to zero.
  for (let i = 0; i < 3; i++) {
    state = takeTokens(state, config, "ip:a", 100n).state;
  }
  const r1 = takeTokens(state, config, "ip:a", 100n);
  assert.equal(r1.allowed, false);
  state = r1.state;
  // Key B has a fresh bucket.
  const r2 = takeTokens(state, config, "ip:b", 100n);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 2n);
});

test("takeTokens handles many distinct keys without bleeding tokens", () => {
  let state = emptyRateLimitState();
  // Drain each of 5 keys fully.
  for (let i = 0; i < 5; i++) {
    const k = "ip:" + i.toString();
    for (let j = 0; j < 3; j++) {
      state = takeTokens(state, config, k, 100n).state;
    }
  }
  // All 5 keys should now reject.
  for (let i = 0; i < 5; i++) {
    const k = "ip:" + i.toString();
    const r = takeTokens(state, config, k, 100n);
    assert.equal(r.allowed, false, "key " + k + " should be drained");
  }
});

test("takeTokens refills each key independently", () => {
  let state = emptyRateLimitState();
  for (let i = 0; i < 3; i++) {
    state = takeTokens(state, config, "ip:x", 100n).state;
    state = takeTokens(state, config, "ip:y", 100n).state;
  }
  // After 5 seconds, both keys refill 5 tokens (capped at 3).
  const r1 = takeTokens(state, config, "ip:x", 105n);
  const r2 = takeTokens(r1.state, config, "ip:y", 105n);
  assert.equal(r1.allowed, true);
  assert.equal(r1.remaining, 2n);
  assert.equal(r2.allowed, true);
  assert.equal(r2.remaining, 2n);
});
