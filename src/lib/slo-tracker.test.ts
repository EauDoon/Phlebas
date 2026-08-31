import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  complianceRatio,
  emptySloState,
  meetsSlo,
  recordSample,
  sloVerdict,
  type SloTarget,
} from "./slo-tracker.ts";

const availability: SloTarget = {
  service: "matcher",
  metric: "availability",
  windowSeconds: 3600n,
  threshold: 0.995,
  comparison: "ge",
};

test("recordSample appends to the per-service per-metric list", () => {
  let state = emptySloState();
  state = recordSample(state, { service: "matcher", metric: "availability", observedAt: 100n, value: 1, success: true });
  state = recordSample(state, { service: "matcher", metric: "availability", observedAt: 200n, value: 1, success: false });
  const key = "matcher:availability";
  assert.equal((state[key] ?? []).length, 2);
});

test("recordSample rejects a negative observed time", () => {
  assert.throws(() => recordSample(emptySloState(), { service: "x", metric: "availability", observedAt: -1n, value: 1, success: true }));
});

test("recordSample caps the per-key buffer at maxSamples", () => {
  let state = emptySloState();
  for (let i = 0n; i < 5n; i++) {
    state = recordSample(state, { service: "x", metric: "availability", observedAt: i, value: 1, success: true }, 3n);
  }
  const key = "x:availability";
  assert.equal((state[key] ?? []).length, 3);
});

test("complianceRatio returns 1 for an empty state", () => {
  assert.equal(complianceRatio(emptySloState(), availability, 1000n), 1);
});

test("complianceRatio returns the success ratio in the window", () => {
  let state = emptySloState();
  for (let i = 0; i < 9; i++) {
    state = recordSample(state, { service: "matcher", metric: "availability", observedAt: 100n + BigInt(i), value: 1, success: true });
  }
  state = recordSample(state, { service: "matcher", metric: "availability", observedAt: 200n, value: 1, success: false });
  assert.equal(complianceRatio(state, availability, 500n), 0.9);
});

test("complianceRatio excludes samples outside the window", () => {
  let state = emptySloState();
  state = recordSample(state, { service: "matcher", metric: "availability", observedAt: 100n, value: 1, success: false });
  state = recordSample(state, { service: "matcher", metric: "availability", observedAt: 5_000n, value: 1, success: true });
  assert.equal(complianceRatio(state, availability, 5_500n), 1);
});

test("meetsSlo returns true when the ratio is at or above the threshold", () => {
  let state = emptySloState();
  for (let i = 0; i < 200; i++) {
    state = recordSample(state, { service: "matcher", metric: "availability", observedAt: 100n + BigInt(i), value: 1, success: true });
  }
  state = recordSample(state, { service: "matcher", metric: "availability", observedAt: 200n, value: 1, success: false });
  assert.equal(meetsSlo(state, availability, 500n), true);
});

test("meetsSlo returns false when the ratio is below the threshold", () => {
  let state = emptySloState();
  for (let i = 0; i < 10; i++) {
    state = recordSample(state, { service: "matcher", metric: "availability", observedAt: 100n + BigInt(i), value: 1, success: true });
  }
  for (let i = 0; i < 10; i++) {
    state = recordSample(state, { service: "matcher", metric: "availability", observedAt: 200n + BigInt(i), value: 1, success: false });
  }
  assert.equal(meetsSlo(state, availability, 500n), false);
});

test("sloVerdict returns a structured summary", () => {
  let state = emptySloState();
  state = recordSample(state, { service: "matcher", metric: "availability", observedAt: 100n, value: 1, success: true });
  const v = sloVerdict(state, availability, 200n);
  assert.equal(v.service, "matcher");
  assert.equal(v.metric, "availability");
  assert.equal(v.threshold, 0.995);
  assert.equal(v.meets, true);
  assert.equal(v.sampleCount, 1);
});
