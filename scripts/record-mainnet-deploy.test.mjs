import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

test("mainnet recorder fails closed before matcher activation", () => {
  for (const args of [
    ["--configure-matcher", "both"],
    ["--configure-matcher=both"],
  ]) {
    const result = spawnSync(process.execPath, ["scripts/record-mainnet-deploy.mjs", ...args], {
      cwd: root,
      encoding: "utf8",
    });
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      /Matcher activation is disabled until the observed Settlement runtime bytecode matches an exact approved identity/,
    );
  }
});
