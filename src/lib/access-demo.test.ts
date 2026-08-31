import assert from "node:assert/strict";
import test from "node:test";

import { COUNTRY_BLOCKED_COPY, isAccessDemo, parseAccessDemo } from "./access-demo.ts";

test("access demo allowlists only open and blocked", () => {
  assert.equal(isAccessDemo("blocked"), true);
  assert.equal(isAccessDemo("open"), true);
  assert.equal(isAccessDemo("deny"), false);
  assert.equal(isAccessDemo("US"), false);
  assert.equal(parseAccessDemo("blocked"), "blocked");
  assert.equal(parseAccessDemo("vpn"), "open");
  assert.equal(parseAccessDemo(undefined), "open");
});

test("country-blocked copy never names a list or invites an override", () => {
  assert.match(COUNTRY_BLOCKED_COPY.label, /State demonstration/);
  assert.doesNotMatch(COUNTRY_BLOCKED_COPY.body, /sanction/i);
  assert.doesNotMatch(COUNTRY_BLOCKED_COPY.body, /VPN/i);
  assert.doesNotMatch(COUNTRY_BLOCKED_COPY.body, /override/i);
  assert.doesNotMatch(COUNTRY_BLOCKED_COPY.body, /geolocat/i);
});
