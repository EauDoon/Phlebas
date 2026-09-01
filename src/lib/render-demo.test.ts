import assert from "node:assert/strict";
import test from "node:test";

import { isRenderFailureQuery, RENDER_FAILURE_MESSAGE, stripRenderFailureSearch } from "./render-demo.ts";

test("render-failure query is allowlisted to 1", () => {
  assert.equal(isRenderFailureQuery("1"), true);
  assert.equal(isRenderFailureQuery("true"), false);
  assert.equal(isRenderFailureQuery("failed"), false);
  assert.equal(isRenderFailureQuery(undefined), false);
});

test("render-failure copy stays a labeled demonstration", () => {
  assert.match(RENDER_FAILURE_MESSAGE, /Labeled rendering-failure demonstration/);
  assert.match(RENDER_FAILURE_MESSAGE, /Retry is safe/);
  assert.match(RENDER_FAILURE_MESSAGE, /nothing was submitted/i);
  assert.doesNotMatch(RENDER_FAILURE_MESSAGE, /\blive\b/i);
  assert.doesNotMatch(RENDER_FAILURE_MESSAGE, /payable|shielded|native-ZEC/i);
});

test("retry strips only the allowlisted render-failure query", () => {
  assert.equal(stripRenderFailureSearch("?error=1"), "");
  assert.equal(stripRenderFailureSearch("?error=1&view=trade"), "?view=trade");
  assert.equal(stripRenderFailureSearch("?education=1"), "?education=1");
  assert.equal(stripRenderFailureSearch("?error=true"), "?error=true");
  assert.equal(stripRenderFailureSearch(""), "");
});
