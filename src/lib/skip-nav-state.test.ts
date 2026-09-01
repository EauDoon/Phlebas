import assert from "node:assert/strict";
import test from "node:test";

import { isSkipNavVisible, nextSkipNavState } from "./skip-nav-state.ts";

test("nextSkipNavState click moves to hidden-after-activation from any state", () => {
  for (const start of ["hidden", "visible", "hidden-after-activation"] as const) {
    assert.equal(nextSkipNavState(start, { kind: "click" }), "hidden-after-activation");
  }
});

test("nextSkipNavState focusin moves to visible from any state", () => {
  for (const start of ["hidden", "visible", "hidden-after-activation"] as const) {
    assert.equal(nextSkipNavState(start, { kind: "focusin" }), "visible");
  }
});

test("nextSkipNavState Escape moves to hidden-after-activation from any state", () => {
  for (const start of ["hidden", "visible", "hidden-after-activation"] as const) {
    assert.equal(nextSkipNavState(start, { kind: "keydown", key: "Escape" }), "hidden-after-activation");
  }
});

test("nextSkipNavState other keys are no-ops", () => {
  for (const start of ["hidden", "visible", "hidden-after-activation"] as const) {
    for (const key of ["Tab", "Enter", "ArrowDown", "a"]) {
      assert.equal(nextSkipNavState(start, { kind: "keydown", key }), start, `key ${key} from ${start}`);
    }
  }
});

test("isSkipNavVisible is true for visible and hidden-after-activation, false for hidden", () => {
  assert.equal(isSkipNavVisible("visible"), true);
  assert.equal(isSkipNavVisible("hidden-after-activation"), true);
  assert.equal(isSkipNavVisible("hidden"), false);
});
