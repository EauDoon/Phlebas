import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  defineCounter,
  emptyMetricsState,
  incCounter,
  readCounter,
  renderPrometheusText,
} from "./metrics.ts";

test("defineCounter adds a counter to the state", () => {
  const state = defineCounter(emptyMetricsState(), "requests_total", "Total HTTP requests");
  assert.ok(state["requests_total"]);
  assert.equal(state["requests_total"].help, "Total HTTP requests");
});

test("defineCounter is idempotent on the same name", () => {
  const a = defineCounter(emptyMetricsState(), "x", "X");
  const b = defineCounter(a, "x", "X");
  assert.equal(a, b);
});

test("defineCounter rejects empty name or help", () => {
  assert.throws(() => defineCounter(emptyMetricsState(), "", "help"));
  assert.throws(() => defineCounter(emptyMetricsState(), "x", ""));
});

test("incCounter increments the named counter with no labels", () => {
  let state = defineCounter(emptyMetricsState(), "hits", "Hits");
  state = incCounter(state, "hits");
  state = incCounter(state, "hits");
  assert.equal(readCounter(state, "hits"), 2n);
});

test("incCounter keeps label combinations separate", () => {
  let state = defineCounter(emptyMetricsState(), "hits", "Hits");
  state = incCounter(state, "hits", { route: "/a" });
  state = incCounter(state, "hits", { route: "/b" });
  state = incCounter(state, "hits", { route: "/a" }, 3n);
  assert.equal(readCounter(state, "hits", { route: "/a" }), 4n);
  assert.equal(readCounter(state, "hits", { route: "/b" }), 1n);
});

test("incCounter rejects a negative increment", () => {
  const state = defineCounter(emptyMetricsState(), "hits", "Hits");
  assert.throws(() => incCounter(state, "hits", {}, -1n));
});

test("incCounter rejects an undefined counter", () => {
  assert.throws(() => incCounter(emptyMetricsState(), "missing"));
});

test("readCounter returns 0 for an unknown counter or label set", () => {
  const state = defineCounter(emptyMetricsState(), "hits", "Hits");
  assert.equal(readCounter(state, "missing"), 0n);
  assert.equal(readCounter(state, "hits", { route: "/x" }), 0n);
});

test("renderPrometheusText emits HELP, TYPE, and the value lines", () => {
  let state = defineCounter(emptyMetricsState(), "requests_total", "Total requests");
  state = incCounter(state, "requests_total", { route: "/a" });
  const text = renderPrometheusText(state);
  assert.match(text, /# HELP requests_total Total requests/);
  assert.match(text, /# TYPE requests_total counter/);
  assert.match(text, /requests_total\{route=\/a\} 1/);
});
