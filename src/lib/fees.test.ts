import assert from "node:assert/strict";
import test from "node:test";

import { AMM_FEE_BPS, MAKER_FEE_BPS, MAX_FEE_BPS, TAKER_FEE_BPS, feeEnvelopeCopy } from "./fees.ts";

const BANNED_LABEL = /simulation|simulator|fixture|inspect|walkthrough/i;

test("version 1 fee envelope stays inside the 30 bps cap", () => {
  assert.equal(MAKER_FEE_BPS, 5);
  assert.equal(TAKER_FEE_BPS, 15);
  assert.equal(AMM_FEE_BPS, 30);
  assert.equal(MAX_FEE_BPS, 30);
  assert.ok(MAKER_FEE_BPS <= MAX_FEE_BPS);
  assert.ok(TAKER_FEE_BPS <= MAX_FEE_BPS);
  assert.ok(AMM_FEE_BPS <= MAX_FEE_BPS);
  assert.equal(
    feeEnvelopeCopy(),
    `Proposed taker ${TAKER_FEE_BPS} bps, maker ${MAKER_FEE_BPS} bps, AMM ${AMM_FEE_BPS} bps. Not deducted in this preview. Protocol fee is zero.`,
  );
  assert.match(feeEnvelopeCopy(), /taker 15 bps/);
  assert.match(feeEnvelopeCopy(), /Not deducted in this preview/);
  assert.match(feeEnvelopeCopy(), /Protocol fee is zero/);
  assert.doesNotMatch(feeEnvelopeCopy(), BANNED_LABEL);
});
