import { strict as assert } from "node:assert";
import { test } from "node:test";

import { emptySloState, recordSample, sloVerdict, type SloTarget } from "./slo-tracker.ts";

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
