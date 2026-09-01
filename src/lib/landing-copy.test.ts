import assert from "node:assert/strict";
import test from "node:test";

import {
  LANDING_HERO,
  LANDING_LEDGER,
  LANDING_LEDGER_HEADING,
  LANDING_SKIP_LINKS,
} from "./landing-copy.ts";

test("landing hero matches the published custody-line copy", () => {
  assert.equal(LANDING_HERO.eyebrow, "Transparent ZEC markets");
  assert.equal(LANDING_HERO.heading, "The custody line, drawn in public.");
  assert.match(LANDING_HERO.supporting, /Native labels are simulation names, not live settlement/);
  assert.doesNotMatch(LANDING_HERO.heading, /\blive\b/i);
});

test("landing ledger names the bounded Ethereum Mainnet wallet connection", () => {
  assert.equal(LANDING_LEDGER_HEADING, "Current system");
  assert.deepEqual(LANDING_LEDGER.map((row) => row.label), [
    "Product",
    "Market data",
    "Wallet connection",
    "Contracts",
    "Custody",
    "Mainnet approval",
    "Country access",
  ]);
  assert.equal(LANDING_LEDGER[2]?.value, "Ethereum Mainnet sign-only");
  for (const row of LANDING_LEDGER) {
    assert.doesNotMatch(row.value, /Sepolia/i);
    assert.doesNotMatch(row.value, /\blive\b/i);
    assert.doesNotMatch(row.value, /payable/i);
  }
});

test("landing skip links follow on-page order through launch gates", () => {
  assert.deepEqual(LANDING_SKIP_LINKS.map((link) => link.href), [
    "#main-content",
    "#markets",
    "#exists-today",
    "#pairs",
    "#terminal-preview",
    "#journeys",
    "#launch-gates",
  ]);
});
