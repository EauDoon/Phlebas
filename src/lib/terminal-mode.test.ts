import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_TERMINAL_MODE,
  isTerminalMode,
  nextTerminalMode,
  parseTerminalModeQuery,
  resolveTerminalMode,
  TERMINAL_MODE_STORAGE_KEY,
  TERMINAL_MODES,
} from "./terminal-mode.ts";

test("mode query allowlists only simple and advanced", () => {
  assert.deepEqual([...TERMINAL_MODES], ["simple", "advanced"]);
  assert.equal(parseTerminalModeQuery("simple"), "simple");
  assert.equal(parseTerminalModeQuery("advanced"), "advanced");
  assert.equal(parseTerminalModeQuery("pro"), null);
  assert.equal(parseTerminalModeQuery("live"), null);
  assert.equal(parseTerminalModeQuery("SIMPLE"), null);
  assert.equal(parseTerminalModeQuery("advanced "), null);
  assert.equal(parseTerminalModeQuery(""), null);
  assert.equal(parseTerminalModeQuery(undefined), null);
  assert.equal(isTerminalMode("simple"), true);
  assert.equal(isTerminalMode("advanced"), true);
  assert.equal(isTerminalMode("live"), false);
  assert.equal(isTerminalMode(undefined), false);
});

test("query wins over stored mode and default is simple", () => {
  assert.equal(DEFAULT_TERMINAL_MODE, "simple");
  assert.equal(TERMINAL_MODE_STORAGE_KEY, "phlebas.terminalMode");
  assert.equal(resolveTerminalMode("advanced", "simple"), "advanced");
  assert.equal(resolveTerminalMode("simple", "advanced"), "simple");
  assert.equal(resolveTerminalMode(undefined, "advanced"), "advanced");
  assert.equal(resolveTerminalMode(undefined, null), "simple");
});

test("invalid query falls back to stored then default", () => {
  assert.equal(resolveTerminalMode("nope", "advanced"), "advanced");
  assert.equal(resolveTerminalMode("live", "simple"), "simple");
  assert.equal(resolveTerminalMode("", "advanced"), "advanced");
  assert.equal(resolveTerminalMode("SIMPLE", "advanced"), "advanced");
  assert.equal(resolveTerminalMode("advanced ", "simple"), "simple");
  assert.equal(resolveTerminalMode("live", "broken"), "simple");
  assert.equal(resolveTerminalMode("pro", ""), "simple");
  assert.equal(resolveTerminalMode("pro", null), "simple");
  assert.equal(resolveTerminalMode(undefined, ""), "simple");
  assert.equal(resolveTerminalMode(undefined, "broken"), "simple");
});

test("next mode toggles between simple and advanced", () => {
  assert.equal(nextTerminalMode("simple"), "advanced");
  assert.equal(nextTerminalMode("advanced"), "simple");
  assert.equal(nextTerminalMode(nextTerminalMode("simple")), "simple");
});
