import { strict as assert } from "node:assert";
import { test } from "node:test";

import { complianceRatio, emptySloState, meetsSlo, recordSample, sloVerdict, type SloTarget } from "./slo-tracker.ts";

const target: SloTarget = {
  service: "matcher",
  metric: "latency_p95_ms",
  windowSeconds: 3600n,
  threshold: 50,
  comparison: "le",
};

test("sloVerdict for an empty state returns ratio 1 and meets true", () => {
  const v = sloVerdict(emptySloState(), target, 100n);
  assert.equal(v.ratio, 1);
  assert.equal(v.meets, true);
  assert.equal(v.sampleCount, 0);
});

test("sloVerdict computes the rolling ratio in the window", () => {
  let state = emptySloState();
  for (let i = 0; i < 10; i++) {
    state = recordSample(state, { service: "matcher", metric: "latency_p95_ms", observedAt: 100n + BigInt(i), value: 30, success: true });
  }
  for (let i = 0; i < 5; i++) {
    state = recordSample(state, { service: "matcher", metric: "latency_p95_ms", observedAt: 200n + BigInt(i), value: 60, success: false });
  }
  const v = sloVerdict(state, target, 500n);
  assert.equal(v.sampleCount, 15);
  assert.equal(v.ratio, 10 / 15);
  assert.equal(v.meets, false);
});

test("a latency target that is comfortably met reports meets true", () => {
  // Before comparison and value were read, a 5ms sample against a 50ms
  // ceiling produced ratio 1 and then compared 1 >= 50, so a latency SLO
  // could never be met however fast the service was.
  let state = emptySloState();
  for (let i = 0; i < 20; i++) {
    state = recordSample(state, { service: "matcher", metric: "latency_p95_ms", observedAt: 100n + BigInt(i), value: 5, success: true });
  }
  const verdict = sloVerdict(state, target, 500n);
  assert.equal(verdict.ratio, 1);
  assert.equal(verdict.objectiveRatio, 0.95);
  assert.equal(verdict.meets, true);
  assert.equal(meetsSlo(state, target, 500n), true);
});

test("a latency sample is judged by its value, not by the caller's success flag", () => {
  // The caller does not get to declare its own compliance: the duration
  // and the target's own direction decide it.
  let state = emptySloState();
  for (let i = 0; i < 20; i++) {
    state = recordSample(state, { service: "matcher", metric: "latency_p95_ms", observedAt: 100n + BigInt(i), value: 5_000, success: true });
  }
  assert.equal(sloVerdict(state, target, 500n).ratio, 0);
  assert.equal(meetsSlo(state, target, 500n), false);
});

test("flipping the comparison flips which samples satisfy the target", () => {
  let state = emptySloState();
  for (let i = 0; i < 10; i++) {
    state = recordSample(state, { service: "matcher", metric: "latency_p95_ms", observedAt: 100n + BigInt(i), value: 5, success: true });
  }
  assert.equal(complianceRatio(state, target, 500n), 1);
  assert.equal(complianceRatio(state, { ...target, comparison: "ge" }, 500n), 0);
});

test("p99 requires a stricter fraction than p95 for the same samples", () => {
  let state = emptySloState();
  for (let i = 0; i < 100; i++) {
    // 97 fast samples and 3 slow ones: enough for p95, not for p99.
    const value = i < 97 ? 10 : 900;
    state = recordSample(state, { service: "matcher", metric: "latency_p95_ms", observedAt: 100n + BigInt(i), value, success: true });
    state = recordSample(state, { service: "matcher", metric: "latency_p99_ms", observedAt: 100n + BigInt(i), value, success: true });
  }
  const p95: SloTarget = { service: "matcher", metric: "latency_p95_ms", windowSeconds: 3600n, threshold: 50, comparison: "le" };
  const p99: SloTarget = { service: "matcher", metric: "latency_p99_ms", windowSeconds: 3600n, threshold: 50, comparison: "le" };
  assert.equal(sloVerdict(state, p95, 500n).meets, true);
  assert.equal(sloVerdict(state, p99, 500n).meets, false);
});

test("an availability threshold outside zero to one is rejected rather than judged", () => {
  // A millisecond bound pasted into an availability target used to be
  // compared against a 0..1 ratio and silently reported as never met.
  const malformed: SloTarget = { service: "matcher", metric: "availability", windowSeconds: 3600n, threshold: 50, comparison: "ge" };
  assert.throws(() => sloVerdict(emptySloState(), malformed, 100n), /fraction between 0 and 1/);
  assert.throws(() => meetsSlo(emptySloState(), malformed, 100n), /fraction between 0 and 1/);
});

test("a negative latency threshold is rejected", () => {
  const malformed: SloTarget = { service: "matcher", metric: "latency_p95_ms", windowSeconds: 3600n, threshold: -1, comparison: "le" };
  assert.throws(() => sloVerdict(emptySloState(), malformed, 100n), /non-negative/);
});
