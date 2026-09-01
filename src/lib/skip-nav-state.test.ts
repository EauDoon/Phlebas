import { strict as assert } from "node:assert";
import { test } from "node:test";

import { isSkipNavVisible, nextSkipNavState, type SkipNavState } from "./skip-nav-state.ts";

test("nextSkipNavState click moves to hidden-after-activation from any state", () => {
  assert.equal(nextSkipNavState("hidden", { kind: "click" }), "hidden-after-activation");
  assert.equal(nextSkipNavState("visible", { kind: "click" }), "hidden-after-activation");
  assert.equal(nextSkipNavState("hidden-after-activation", { kind: "click" }), "hidden-after-activation");
});

test("nextSkipNavState focusin moves to visible from any state", () => {
  assert.equal(nextSkipNavState("hidden", { kind: "focusin" }), "visible");
  assert.equal(nextSkipNavState("visible", { kind: "focusin" }), "visible");
  assert.equal(nextSkipNavState("hidden-after-activation", { kind: "focusin" }), "visible");
});

test("nextSkipNavState Escape moves to hidden-after-activation from any state", () => {
  assert.equal(nextSkipNavState("hidden", { kind: "keydown", key: "Escape" }), "hidden-after-activation");
  assert.equal(nextSkipNavState("visible", { kind: "keydown", key: "Escape" }), "hidden-after-activation");
  assert.equal(nextSkipNavState("hidden-after-activation", { kind: "keydown", key: "Escape" }), "hidden-after-activation");
});

test("nextSkipNavState other keys are no-ops", () => {
  assert.equal(nextSkipNavState("visible", { kind: "keydown", key: "Tab" }), "visible");
  assert.equal(nextSkipNavState("hidden", { kind: "keydown", key: "Enter" }), "hidden");
});

test("isSkipNavVisible is true for visible and hidden-after-activation, false for hidden", () => {
  const states: SkipNavState[] = ["hidden", "visible", "hidden-after-activation"];
  assert.equal(isSkipNavVisible(states[0]!), false);
  assert.equal(isSkipNavVisible(states[1]!), true);
  assert.equal(isSkipNavVisible(states[2]!), true);
});
