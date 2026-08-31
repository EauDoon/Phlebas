import assert from "node:assert/strict";
import test from "node:test";

import {
  LANDING_HERO,
  LANDING_LEDGER,
  LANDING_LEDGER_HEADING,
  LANDING_PZEC,
  LANDING_SKIP_LINKS,
} from "./landing-copy.ts";

test("landing hero matches the published custody-line copy", () => {
  assert.equal(LANDING_HERO.eyebrow, "A transparent pZEC market design");
  assert.equal(LANDING_HERO.heading, "An order book for pZEC, with the custody line drawn in public.");
  assert.match(LANDING_HERO.supporting, /no-value simulation/);
  assert.match(LANDING_HERO.supporting, /pZEC does not exist today/);
  assert.doesNotMatch(LANDING_HERO.supporting, /\blive\b/i);
  assert.doesNotMatch(LANDING_HERO.heading, /\blive\b/i);
});

test("landing ledger names an unavailable wallet, not optional Sepolia", () => {
  assert.equal(LANDING_LEDGER_HEADING, "Current system");
  assert.deepEqual(LANDING_LEDGER.map((row) => row.label), [
    "Product",
    "Market data",
    "Wallet connection",
    "Contracts",
    "Custody",
    "Mainnet approval",
  ]);
  assert.equal(LANDING_LEDGER[2]?.value, "Unavailable");
  for (const row of LANDING_LEDGER) {
    assert.doesNotMatch(row.value, /Sepolia/i);
    assert.doesNotMatch(row.value, /\blive\b/i);
    assert.doesNotMatch(row.value, /payable/i);
  }
});

test("pZEC copy is a custody-backed receipt, not native ZEC", () => {
  assert.equal(LANDING_PZEC.heading, "pZEC would be a custody-backed receipt, not native ZEC.");
  assert.match(LANDING_PZEC.body, /custody operator would control the native reserve/);
  assert.match(LANDING_PZEC.negation, /not native ZEC, shielded ZEC, or a trustless bridge asset/);
  assert.match(LANDING_PZEC.disclosure, /No shielded deposit or withdrawal is planned for v1/);
  assert.equal(LANDING_PZEC.flow[0]?.title, "Transparent native ZEC");
  assert.equal(LANDING_PZEC.flow[3]?.title, "Order book or fixed LP pool");
  assert.doesNotMatch(LANDING_PZEC.heading, /is native ZEC/);
});

test("landing skip links reach journeys, evidence, and the terminal preview", () => {
  assert.deepEqual(LANDING_SKIP_LINKS.map((link) => link.href), [
    "#main-content",
    "#journeys",
    "#exists-today",
    "#terminal-preview",
  ]);
});
