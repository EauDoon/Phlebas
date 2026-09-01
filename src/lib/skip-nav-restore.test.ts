import { strict as assert } from "node:assert";
import { test } from "node:test";

import { skipNavClass } from "./skip-nav-restore.ts";

test("skipNavClass returns the hidden class for the hidden state", () => {
  assert.equal(skipNavClass("hidden"), "skip-nav--hidden");
});

test("skipNavClass returns the visible class for the visible state", () => {
  assert.equal(skipNavClass("visible"), "skip-nav--visible");
});

test("skipNavClass returns the hidden-after-activation class for the hidden-after-activation state", () => {
  assert.equal(skipNavClass("hidden-after-activation"), "skip-nav--hidden-after-activation");
});
