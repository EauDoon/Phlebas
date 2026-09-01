import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TERMINAL_MODE,
  isTerminalMode,
  nextTerminalMode,
  parseTerminalModeQuery,
  resolveTerminalMode,
  TERMINAL_MODE_STORAGE_KEY,
} from "./terminal-mode.ts";

test("mode query allowlists only simple and advanced", () => {
  assert.equal(parseTerminalModeQuery("simple"), "simple");
  assert.equal(parseTerminalModeQuery("advanced"), "advanced");
  assert.equal(parseTerminalModeQuery("pro"), null);
  assert.equal(parseTerminalModeQuery(undefined), null);
  assert.equal(isTerminalMode("simple"), true);
  assert.equal(isTerminalMode("live"), false);
});

test("query wins over stored mode and default is simple", () => {
  assert.equal(DEFAULT_TERMINAL_MODE, "simple");
  assert.equal(TERMINAL_MODE_STORAGE_KEY, "phlebas.terminalMode");
  assert.equal(resolveTerminalMode("advanced", "simple"), "advanced");
  assert.equal(resolveTerminalMode(undefined, "advanced"), "advanced");
  assert.equal(resolveTerminalMode("nope", "advanced"), "advanced");
  assert.equal(resolveTerminalMode(undefined, null), "simple");
  assert.equal(resolveTerminalMode("live", "broken"), "simple");
});

test("next mode toggles between simple and advanced", () => {
  assert.equal(nextTerminalMode("simple"), "advanced");
  assert.equal(nextTerminalMode("advanced"), "simple");
});
