import { strict as assert } from "node:assert";
import { test } from "node:test";

import { mapEVMEvent, mapZcashEvent } from "./transition-mapper.ts";

const FILL = ("0x" + "11".repeat(32)) as `0x${string}`;

test("mapEVMEvent maps deposited to evm-leg-funded", () => {
  const out = mapEVMEvent("deposited", FILL, 100n);
  assert.equal(out.side, "evm");
  assert.equal(out.transition, "evm-leg-funded");
  assert.equal(out.observedAt, 100n);
  assert.equal(out.fillId, FILL);
});

test("mapEVMEvent maps claimed to evm-leg-claimed", () => {
  const out = mapEVMEvent("claimed", FILL, 200n);
  assert.equal(out.transition, "evm-leg-claimed");
  assert.equal(out.observedAt, 200n);
});

test("mapEVMEvent maps refunded to evm-leg-refunded", () => {
  const out = mapEVMEvent("refunded", FILL, 300n);
  assert.equal(out.transition, "evm-leg-refunded");
});

test("mapZcashEvent maps funded to zec-leg-funded", () => {
  const out = mapZcashEvent("funded", FILL, 400n);
  assert.equal(out.side, "zec");
  assert.equal(out.transition, "zec-leg-funded");
  assert.equal(out.observedAt, 400n);
});

test("mapZcashEvent maps claimed to zec-leg-claimed", () => {
  const out = mapZcashEvent("claimed", FILL, 500n);
  assert.equal(out.transition, "zec-leg-claimed");
});

test("mapZcashEvent maps refunded to zec-leg-refunded", () => {
  const out = mapZcashEvent("refunded", FILL, 600n);
  assert.equal(out.transition, "zec-leg-refunded");
});
