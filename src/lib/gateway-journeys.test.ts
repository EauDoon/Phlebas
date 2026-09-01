import assert from "node:assert/strict";
import test from "node:test";

import {
  GATEWAY_JOURNEYS,
  isGatewayJourney,
  nextGatewayJourney,
} from "./gateway-journeys.ts";

test("gateway journeys wrap under arrow deltas", () => {
  assert.deepEqual([...GATEWAY_JOURNEYS], ["deposit", "withdrawal"]);
  assert.equal(isGatewayJourney("withdrawal"), true);
  assert.equal(isGatewayJourney("mint"), false);
  assert.equal(nextGatewayJourney("deposit", 1), "withdrawal");
  assert.equal(nextGatewayJourney("withdrawal", 1), "deposit");
  assert.equal(nextGatewayJourney("deposit", -1), "withdrawal");
});
