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
  // The exposition format requires a double-quoted label value.
  assert.match(text, /requests_total\{route="\/a"\} 1/);
});

test("a label value cannot inject a line into the scrape", () => {
  // Unquoted and unescaped, a value carrying "}" and a line feed closed
  // the label list and started a sample line of its own, so any label
  // taken from a request could write arbitrary series into /metrics.
  let state = defineCounter(emptyMetricsState(), "requests_total", "Total requests");
  state = incCounter(state, "requests_total", { agent: "a} 1\ninjected_total 999999 #" });
  const text = renderPrometheusText(state);
  assert.equal(text.includes("\ninjected_total"), false);
  assert.equal(text.split("\n").filter((line) => line.length > 0).length, 3);
});

test("a backslash or quote in a label value is escaped", () => {
  let state = defineCounter(emptyMetricsState(), "requests_total", "Total requests");
  state = incCounter(state, "requests_total", { path: 'C:\\a"b' });
  const line = renderPrometheusText(state).split("\n")[2] ?? "";
  assert.equal(line, 'requests_total{path="C:\\\\a\\"b"} 1');
});

test("label sets that flatten to the same string stay separate series", () => {
  // {a: "b,c=d"} and {a: "b", c: "d"} both became the key `a=b,c=d`, so
  // two different label sets were counted as one series.
  let state = defineCounter(emptyMetricsState(), "x_total", "x");
  state = incCounter(state, "x_total", { a: "b,c=d" });
  state = incCounter(state, "x_total", { a: "b", c: "d" });
  assert.equal(readCounter(state, "x_total", { a: "b,c=d" }), 1n);
  assert.equal(readCounter(state, "x_total", { a: "b", c: "d" }), 1n);
  assert.equal(renderPrometheusText(state).split("\n").filter((line) => line.startsWith("x_total")).length, 2);
});

test("a name that is not a Prometheus identifier is rejected", () => {
  assert.throws(() => defineCounter(emptyMetricsState(), "requests-total", "help"), /Prometheus metric name/);
  assert.throws(() => defineCounter(emptyMetricsState(), "1_total", "help"), /Prometheus metric name/);
  const state = defineCounter(emptyMetricsState(), "requests_total", "help");
  assert.throws(() => incCounter(state, "requests_total", { "bad-label": "v" }), /Prometheus label name/);
});

test("a line feed in the help text cannot start a new line", () => {
  const state = defineCounter(emptyMetricsState(), "requests_total", "first\n# TYPE injected counter");
  const text = renderPrometheusText(state);
  assert.equal(text.split("\n").filter((line) => line.startsWith("# TYPE")).length, 1);
});
