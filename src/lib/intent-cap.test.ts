import assert from "node:assert/strict";
import test from "node:test";

import { GATEWAY_DEFAULT_MAX_INTENTS, gatewayMaxIntents } from "./intent-cap.ts";

test("gateway intent cap defaults to 64 and rejects non-positive env", () => {
  assert.equal(GATEWAY_DEFAULT_MAX_INTENTS, 64);
  assert.equal(gatewayMaxIntents({}), 64);
  assert.equal(gatewayMaxIntents({ PHLEBAS_GATEWAY_MAX_INTENTS: "8" }), 8);
  assert.equal(gatewayMaxIntents({ PHLEBAS_GATEWAY_MAX_INTENTS: "0" }), 64);
  assert.equal(gatewayMaxIntents({ PHLEBAS_GATEWAY_MAX_INTENTS: "nope" }), 64);
});
