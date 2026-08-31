import assert from "node:assert/strict";
import test from "node:test";

import {
  gatewayIssuedCopy,
  gatewayIssuingCopy,
  gatewayOffCopy,
  gatewayUnavailableCopy,
} from "./gateway-copy.ts";

test("gateway copy helpers keep honest empty error and retry strings", () => {
  assert.equal(gatewayOffCopy(), "Local gateway off. No receivable address is displayed.");
  assert.equal(
    gatewayIssuingCopy(),
    "Issuing a local textest intent. Nothing is receivable until a loopback gateway answers.",
  );
  assert.equal(
    gatewayUnavailableCopy(),
    "Local gateway unavailable. No receivable address is displayed.",
  );
  assert.equal(
    gatewayIssuedCopy(),
    "Testnet TEX issued for this session intent. Not mainnet, not minted credit.",
  );

  assert.match(gatewayUnavailableCopy(), /unavailable/);
  assert.match(gatewayUnavailableCopy(), /No receivable address/);
  assert.match(gatewayOffCopy(), /off/);
  assert.match(gatewayOffCopy(), /No receivable address/);

  assert.doesNotMatch(gatewayOffCopy(), /pZEC/);
  assert.doesNotMatch(gatewayIssuingCopy(), /pZEC/);
  assert.doesNotMatch(gatewayUnavailableCopy(), /pZEC/);
  assert.doesNotMatch(gatewayIssuedCopy(), /pZEC/);
});
