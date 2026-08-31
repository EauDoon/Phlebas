import assert from "node:assert/strict";
import test from "node:test";

import { LANDING_GATE_STATUS, LANDING_MAINNET_GATES } from "./landing-gates.ts";

test("mainnet gates are six evidence rows, all not cleared", () => {
  assert.equal(LANDING_GATE_STATUS, "Not cleared");
  assert.equal(LANDING_MAINNET_GATES.length, 6);
  assert.match(LANDING_MAINNET_GATES[5], /USDT0 has a separate later gate/);
});

test("mainnet gate copy has no launch date, countdown, or waitlist", () => {
  const joined = LANDING_MAINNET_GATES.join(" ");
  assert.doesNotMatch(joined, /\b20\d{2}-\d{2}-\d{2}\b/);
  assert.doesNotMatch(joined, /countdown/i);
  assert.doesNotMatch(joined, /waitlist/i);
  assert.doesNotMatch(joined, /\bpercent\b/i);
  assert.doesNotMatch(joined, /\blive\b/i);
});
