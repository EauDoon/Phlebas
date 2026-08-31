import assert from "node:assert/strict";
import test from "node:test";

import { interpretRovingKey } from "./roving-keys.ts";

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
