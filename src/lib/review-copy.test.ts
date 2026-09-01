import assert from "node:assert/strict";
import test from "node:test";

import { custodyRedemptionCopy, publicLinkabilityCopy } from "./review-copy.ts";

test("high-risk review copy names ZEC custody not listed pZEC", () => {
  assert.match(publicLinkabilityCopy("fill"), /publicly linkable/);
  assert.match(publicLinkabilityCopy("LP action"), /LP action/);
  assert.match(custodyRedemptionCopy(), /ZEC custody and redemption/);
  assert.match(custodyRedemptionCopy(), /not live settlement/);
  assert.doesNotMatch(custodyRedemptionCopy(), /pZEC/);
  assert.doesNotMatch(publicLinkabilityCopy("fill"), /pZEC/);
  assert.doesNotMatch(publicLinkabilityCopy("LP action"), /pZEC/);
});
