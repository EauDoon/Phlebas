import assert from "node:assert/strict";
import test from "node:test";

import {
  BLOTTER_TABS,
  isBlotterTab,
  nextBlotterTab,
} from "./blotter-tabs.ts";

test("blotter tabs wrap under arrow deltas", () => {
  assert.deepEqual([...BLOTTER_TABS], ["orders", "fills", "inventory", "log"]);
  assert.equal(isBlotterTab("fills"), true);
  assert.equal(isBlotterTab("depth"), false);
  assert.equal(nextBlotterTab("orders", 1), "fills");
  assert.equal(nextBlotterTab("log", 1), "orders");
  assert.equal(nextBlotterTab("orders", -1), "log");
  assert.equal(nextBlotterTab("inventory", 2), "orders");
});
