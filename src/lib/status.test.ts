import assert from "node:assert/strict";
import test from "node:test";

import { simulationStatus } from "./status.ts";

test("status payload never claims live funds or custody", () => {
  const status = simulationStatus();
  assert.equal(status.liveFunds, false);
  assert.equal(status.custody, "none");
  assert.equal(status.deposits, "disabled");
  assert.equal(status.wallets, "disabled");
  assert.equal(status.matcher, "in-browser");
  assert.equal(status.mode, "simulation");
});
