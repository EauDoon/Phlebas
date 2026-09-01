import assert from "node:assert/strict";
import test from "node:test";

import { LANDING_EVIDENCE } from "./landing-evidence.ts";

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

const shipped = corpus(LANDING_EVIDENCE);

test("landing evidence is the why-not-wrapped bound", () => {
  assert.equal(LANDING_EVIDENCE.length, 4);
  assert.deepEqual(
    LANDING_EVIDENCE.map((row) => row.title),
    ["No pZEC", "No mint", "No omnibus", "No shared LP token"],
  );
  assert.match(LANDING_EVIDENCE[3].body, /Solvers keep inventory in their own wallets/);
});

test("pZEC appears only as a rejected product, never as live settlement", () => {
  const pzecRows = LANDING_EVIDENCE.filter((row) => /pZEC/i.test(`${row.title} ${row.body}`));
  assert.ok(pzecRows.length >= 1);
  for (const row of pzecRows) {
    assert.match(`${row.title} ${row.body}`, /no pZEC/i);
  }
  assert.doesNotMatch(shipped, /pZEC is (?:the live|native|the product)/i);
  assert.doesNotMatch(shipped, /mint pZEC|wrap(?:ped)? ZEC as pZEC/i);
});

test("landing evidence does not list USDT0 or claim live funds", () => {
  assert.doesNotMatch(shipped, /\bsimulations?\b/i);
  assert.doesNotMatch(shipped, /\bsimulator\b/i);
  assert.doesNotMatch(shipped, /\bfixtures?\b/i);
  assert.doesNotMatch(shipped, /\bno-value\b/i);
  assert.doesNotMatch(shipped, /\binspect\b/i);
  assert.doesNotMatch(shipped, /\bwalkthrough\b/i);
  for (const row of LANDING_EVIDENCE) {
    assert.doesNotMatch(row.body, /\blive funds\b/i);
    assert.doesNotMatch(row.body, /\bis a live exchange\b/i);
    assert.doesNotMatch(row.body, /\btrustless\b/i);
    assert.doesNotMatch(row.body, /\bis audited\b/i);
    assert.doesNotMatch(row.body, /\bpayable\b/i);
    assert.doesNotMatch(row.body, /\bshielded market\b/i);
    assert.doesNotMatch(row.body, /APY|APR|yield/i);
    assert.doesNotMatch(row.body, /USDT0/);
  }
});
