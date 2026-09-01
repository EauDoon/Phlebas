import assert from "node:assert/strict";
import test from "node:test";

import {
  TERMINAL_VIEWS,
  isTerminalView,
  nextTerminalView,
} from "./terminal-views.ts";

test("terminal views wrap under arrow deltas", () => {
  assert.deepEqual([...TERMINAL_VIEWS], ["trade", "settlement", "liquidity", "bridge", "architecture"]);
  assert.equal(isTerminalView("bridge"), true);
  assert.equal(isTerminalView("status"), false);
  assert.equal(nextTerminalView("trade", 1), "settlement");
  assert.equal(nextTerminalView("architecture", 1), "trade");
  assert.equal(nextTerminalView("trade", -1), "architecture");
  assert.equal(nextTerminalView("liquidity", 2), "architecture");
});
