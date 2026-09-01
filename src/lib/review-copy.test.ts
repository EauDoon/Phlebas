import assert from "node:assert/strict";
import test from "node:test";

import { custodyRedemptionCopy, publicLinkabilityCopy } from "./review-copy.ts";

test("high-risk review copy identifies the removed custody model", () => {
  assert.match(publicLinkabilityCopy("fill"), /publicly linkable/);
  assert.match(publicLinkabilityCopy("LP action"), /LP action/);
  assert.match(custodyRedemptionCopy(), /historical ZEC custody and redemption/i);
  assert.match(custodyRedemptionCopy(), /removed from runtime/i);
  assert.match(custodyRedemptionCopy(), /not live settlement/);
  assert.doesNotMatch(custodyRedemptionCopy(), /pZEC/);
  assert.doesNotMatch(publicLinkabilityCopy("fill"), /pZEC/);
  assert.doesNotMatch(publicLinkabilityCopy("LP action"), /pZEC/);
});
