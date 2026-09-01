import assert from "node:assert/strict";
import test from "node:test";

import { applyRovingAction, applyRovingKey, interpretRovingKey } from "./roving-keys.ts";

const tabs = ["a", "b", "c"] as const;

test("roving keys map arrows home end and select", () => {
  assert.equal(interpretRovingKey("ArrowRight"), "next");
  assert.equal(interpretRovingKey("ArrowDown"), "next");
  assert.equal(interpretRovingKey("ArrowLeft"), "prev");
  assert.equal(interpretRovingKey("ArrowUp"), "prev");
  assert.equal(interpretRovingKey("Home"), "home");
  assert.equal(interpretRovingKey("End"), "end");
  assert.equal(interpretRovingKey("Enter"), "select");
  assert.equal(interpretRovingKey(" "), "select");
  assert.equal(interpretRovingKey("g"), null);
});

test("roving tabs wrap under arrows and jump on home end", () => {
  assert.equal(applyRovingAction(tabs, "a", "next"), "b");
  assert.equal(applyRovingAction(tabs, "c", "next"), "a");
  assert.equal(applyRovingAction(tabs, "a", "prev"), "c");
  assert.equal(applyRovingAction(tabs, "b", "home"), "a");
  assert.equal(applyRovingAction(tabs, "b", "end"), "c");
  assert.equal(applyRovingAction(tabs, "b", "select"), "b");
});

test("roving tab keys ignore non-navigation input", () => {
  assert.deepEqual(applyRovingKey(tabs, "a", "ArrowRight"), { action: "next", id: "b" });
  assert.deepEqual(applyRovingKey(tabs, "b", "Home"), { action: "home", id: "a" });
  assert.deepEqual(applyRovingKey(tabs, "a", "Enter"), { action: "select", id: "a" });
  assert.equal(applyRovingKey(tabs, "a", "g"), null);
  assert.throws(() => applyRovingAction([], "a", "next"), /empty/);
  assert.throws(() => applyRovingAction(tabs, "z", "next"), /not in the list/);
});
