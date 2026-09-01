import assert from "node:assert/strict";
import test from "node:test";

import { DEPOSIT_TOUR, depositTourStep } from "./deposit-tour.ts";

test("deposit tour walks eligibility through complete without minting", () => {
  assert.equal(DEPOSIT_TOUR.length, 7);
  assert.equal(DEPOSIT_TOUR[0].title, "Eligibility");
  assert.equal(DEPOSIT_TOUR[1].title, "Address request");
  assert.match(DEPOSIT_TOUR[1].body, /No address generated in simulation/);
  assert.equal(DEPOSIT_TOUR[6].title, "Complete");
  assert.match(DEPOSIT_TOUR[6].body, /No native ZEC was received and no pZEC was minted/);
  assert.equal(depositTourStep(-1).id, "eligibility");
  assert.equal(depositTourStep(99).id, "complete");
});

test("deposit tour does not present a receivable address or shielded path", () => {
  const joined = DEPOSIT_TOUR.map((step) => `${step.title} ${step.body}`).join(" ");
  assert.doesNotMatch(joined, /tex1/i);
  assert.doesNotMatch(joined, /t1[A-Za-z0-9]/);
  assert.doesNotMatch(joined, /zs1/i);
  assert.doesNotMatch(joined, /zcash:/i);
  assert.doesNotMatch(joined, /receivable/i);
  assert.doesNotMatch(joined, /payable/i);
  assert.doesNotMatch(joined, /shielded/i);
  assert.doesNotMatch(joined, /Deposit ZEC/);
  assert.doesNotMatch(joined, /\blive\b/i);
  for (let index = 0; index < DEPOSIT_TOUR.length; index += 1) {
    const step = depositTourStep(index);
    assert.doesNotMatch(`${step.title} ${step.body}`, /tex1|zs1|receivable|payable|shielded/i);
  }
});
