import assert from "node:assert/strict";
import test from "node:test";

import { COUNTRY_ACCESS, isCountryEnabled } from "./country-access.ts";

test("country access denies every ISO code until an explicit enable list exists", () => {
  assert.equal(COUNTRY_ACCESS.default, "deny");
  assert.deepEqual(COUNTRY_ACCESS.enabled, []);
  assert.equal(isCountryEnabled("US"), false);
  assert.equal(isCountryEnabled("SG"), false);
  assert.equal(isCountryEnabled("us"), false);
  assert.equal(isCountryEnabled("USA"), false);
  assert.equal(isCountryEnabled(""), false);
  assert.equal(isCountryEnabled("SG", { default: "deny", enabled: ["SG"] }), true);
  assert.equal(isCountryEnabled("US", { default: "deny", enabled: ["SG"] }), false);
});
