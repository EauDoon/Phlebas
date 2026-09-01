import { strict as assert } from "node:assert";
import { test } from "node:test";

import { detectReorg } from "./reorg-detector.ts";

test("detectReorg returns none when the fresh tip is ahead", () => {
  const out = detectReorg(100n, 200n, 10n);
  assert.equal(out.reorgDetected, false);
  assert.equal(out.recommendation, "none");
  assert.equal(out.depthBlocks, 0n);
});

test("detectReorg returns none when the fresh tip equals the previous tip", () => {
  const out = detectReorg(100n, 100n, 10n);
  assert.equal(out.reorgDetected, false);
  assert.equal(out.recommendation, "none");
});

test("detectReorg returns freeze when the depth is at the reorg threshold", () => {
  const out = detectReorg(100n, 90n, 10n);
  assert.equal(out.reorgDetected, true);
  assert.equal(out.depthBlocks, 10n);
  assert.equal(out.recommendation, "freeze");
});

test("detectReorg returns resync when the depth exceeds the reorg threshold", () => {
  const out = detectReorg(100n, 50n, 10n);
  assert.equal(out.reorgDetected, true);
  assert.equal(out.depthBlocks, 50n);
  assert.equal(out.recommendation, "resync");
});

test("detectReorg rejects a negative previous tip", () => {
  assert.throws(() => detectReorg(-1n, 100n, 10n));
});

test("detectReorg rejects a negative fresh tip", () => {
  assert.throws(() => detectReorg(100n, -1n, 10n));
});

test("detectReorg rejects a previous tip above uint64", () => {
  assert.throws(() => detectReorg(2n ** 65n, 100n, 10n));
});
