import { strict as assert } from "node:assert";
import { promises as fs } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { tmpdir } from "node:os";

import { applyTransition, emptyCoordinator } from "./atomic-coordinator.ts";
import { readSnapshot, writeSnapshot } from "./coordinator-persistence.ts";

async function mkTmpDir(): Promise<string> {
  const dir = await fs.mkdtemp(join(tmpdir(), "phlebas-persist-"));
  return dir;
}

const FILL_A = "0x" + "aa".repeat(32);

test("readSnapshot returns null when the file does not exist", async () => {
  const dir = await mkTmpDir();
  try {
    const out = await readSnapshot({ path: join(dir, "missing.json") });
    assert.equal(out, null);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("writeSnapshot then readSnapshot round-trips the coordinator", async () => {
  const dir = await mkTmpDir();
  try {
    const path = join(dir, "coordinator.json");
    let state = emptyCoordinator();
    state = applyTransition(state, FILL_A, "evm-leg-funded", 100n);
    state = applyTransition(state, FILL_A, "zec-leg-funded", 200n);
    await writeSnapshot({ path }, state);
    const restored = await readSnapshot({ path });
    assert.ok(restored);
    assert.equal(restored.cursor, state.cursor);
    assert.equal(restored.fills[FILL_A].zecLeg.state, "funded");
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("writeSnapshot overwrites the previous file atomically", async () => {
  const dir = await mkTmpDir();
  try {
    const path = join(dir, "coordinator.json");
    await writeSnapshot({ path }, emptyCoordinator());
    await writeSnapshot({ path }, applyTransition(emptyCoordinator(), FILL_A, "evm-leg-funded", 100n));
    const restored = await readSnapshot({ path });
    assert.ok(restored);
    assert.equal(restored.cursor, 1n);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test("writeSnapshot creates missing directories", async () => {
  const dir = await mkTmpDir();
  try {
    const path = join(dir, "nested", "more", "coordinator.json");
    await writeSnapshot({ path }, emptyCoordinator());
    const restored = await readSnapshot({ path });
    assert.ok(restored);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
