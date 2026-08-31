import assert from "node:assert/strict";
import test from "node:test";

import { isLoadingForceQuery } from "./loading-demo.ts";

test("loading query is allowlisted to 1", () => {
  assert.equal(isLoadingForceQuery("1"), true);
  assert.equal(isLoadingForceQuery("true"), false);
  assert.equal(isLoadingForceQuery("loading"), false);
  assert.equal(isLoadingForceQuery(undefined), false);
});
