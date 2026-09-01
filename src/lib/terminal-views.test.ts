import assert from "node:assert/strict";
import test from "node:test";

import {
  TERMINAL_VIEWS,
  isRenderableTerminalView,
  isTerminalView,
  nextTerminalView,
} from "./terminal-views.ts";

test("terminal views include settlement and exclude bridge as primary", () => {
  assert.deepEqual([...TERMINAL_VIEWS], ["trade", "settlement", "architecture"]);
  assert.equal(isTerminalView("settlement"), true);
  assert.equal(isTerminalView("bridge"), false);
  assert.equal(isTerminalView("liquidity"), false);
  assert.equal(isTerminalView("status"), false);
  assert.equal(isRenderableTerminalView("liquidity"), true);
  assert.equal(isRenderableTerminalView("bridge"), true);
  assert.equal(isRenderableTerminalView("trade"), true);
  assert.equal(nextTerminalView("trade", 1), "settlement");
  assert.equal(nextTerminalView("settlement", 1), "architecture");
  assert.equal(nextTerminalView("architecture", 1), "trade");
  assert.equal(nextTerminalView("trade", -1), "architecture");
  assert.equal(nextTerminalView("architecture", 2), "settlement");
});

test("architecture, liquidity, and trade remain renderable views", () => {
  assert.equal(isTerminalView("trade"), true);
  assert.equal(isTerminalView("architecture"), true);
  assert.equal(isRenderableTerminalView("trade"), true);
  assert.equal(isRenderableTerminalView("architecture"), true);
  assert.equal(isRenderableTerminalView("liquidity"), true);
  assert.equal(isRenderableTerminalView("pro"), false);
});

