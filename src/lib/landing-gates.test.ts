import assert from "node:assert/strict";
import test from "node:test";

import {
  LANDING_GATES_ACTION,
  LANDING_GATES_HREF,
  LANDING_GATES_INTRO,
  LANDING_GATES_SUMMARY,
  LANDING_GATE_STATUS,
  LANDING_MAINNET_GATES,
} from "./landing-gates.ts";

function corpus(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(corpus).join("\n");
  }
  if (value && typeof value === "object") {
    return Object.values(value).map(corpus).join("\n");
  }
  return "";
}

const shipped = corpus({
  LANDING_GATE_STATUS,
  LANDING_GATES_INTRO,
  LANDING_GATES_SUMMARY,
  LANDING_GATES_ACTION,
  LANDING_GATES_HREF,
  LANDING_MAINNET_GATES,
});

test("homepage gate copy is a not-cleared sentence plus architecture link", () => {
  assert.equal(LANDING_GATE_STATUS, "Not cleared");
  assert.equal(LANDING_GATES_INTRO.eyebrow, "Not cleared for real assets");
  assert.match(LANDING_GATES_SUMMARY, /Read the launch gates/);
  assert.equal(LANDING_GATES_ACTION, "Read the launch gates");
  assert.equal(LANDING_GATES_HREF, "/trade?view=architecture");
});

test("mainnet gate list abandons USDT0 instead of deferring it", () => {
  assert.equal(LANDING_MAINNET_GATES.length, 6);
  assert.match(LANDING_MAINNET_GATES[5], /USDT0 is abandoned/);
  assert.doesNotMatch(corpus(LANDING_MAINNET_GATES), /separate later gate/i);
  assert.doesNotMatch(corpus(LANDING_MAINNET_GATES), /USDT0 listing|lists USDT0/i);
});

test("mainnet gate copy has no launch date, countdown, waitlist, or live-funds claim", () => {
  assert.doesNotMatch(shipped, /\b20\d{2}-\d{2}-\d{2}\b/);
  assert.doesNotMatch(shipped, /countdown/i);
  assert.doesNotMatch(shipped, /waitlist/i);
  assert.doesNotMatch(shipped, /\bpercent\b/i);
  assert.doesNotMatch(shipped, /\blive funds\b/i);
  assert.doesNotMatch(shipped, /\bis a live exchange\b/i);
  assert.doesNotMatch(shipped, /\btrustless\b/i);
  assert.doesNotMatch(shipped, /\bis audited\b/i);
  assert.doesNotMatch(shipped, /pZEC is (?:the live|native|the product)/i);
  assert.doesNotMatch(shipped, /\bsimulations?\b/i);
  assert.doesNotMatch(shipped, /\bsimulator\b/i);
  assert.doesNotMatch(shipped, /\bfixtures?\b/i);
  assert.doesNotMatch(shipped, /\bno-value\b/i);
  assert.doesNotMatch(shipped, /\binspect\b/i);
  assert.doesNotMatch(shipped, /\bwalkthrough\b/i);
});
