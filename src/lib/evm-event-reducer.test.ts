import { strict as assert } from "node:assert";
import { test } from "node:test";

import { reduceEVMEvents } from "./evm-event-reducer.ts";
import type { EVMEvent } from "./evm-observer.ts";

function event(kind: EVMEvent["kind"], fillId: string, blockNumber: bigint, logIndex: number = 0): EVMEvent {
  return {
    kind,
    fillId,
    blockNumber,
    txHash: "0x" + "00".repeat(32),
    logIndex,
    data: { raw: "0x" },
  };
}

const FILL_A = "0x" + "aa".repeat(32);
const FILL_B = "0x" + "bb".repeat(32);

test("reduceEVMEvents maps every event to a transition", () => {
  const events: EVMEvent[] = [
    event("funded", FILL_A, 100n),
    event("claimed", FILL_A, 200n),
    event("refunded", FILL_B, 250n),
  ];
  const out = reduceEVMEvents(events);
  assert.equal(out.length, 3);
  assert.equal(out[0].transition, "evm-leg-funded");
  assert.equal(out[1].transition, "evm-leg-claimed");
  assert.equal(out[2].transition, "evm-leg-refunded");
});

test("reduceEVMEvents returns an empty array for no events", () => {
  assert.equal(reduceEVMEvents([]).length, 0);
});

test("reduceEVMEvents sorts by observed timestamp then fill id", () => {
  const events: EVMEvent[] = [
    event("claimed", FILL_B, 300n),
    event("funded", FILL_A, 100n),
    event("funded", FILL_B, 200n),
  ];
  const out = reduceEVMEvents(events);
  assert.equal(out[0].fillId, FILL_A);
  assert.equal(out[0].observedAt, 100n);
  assert.equal(out[0].transition, "evm-leg-funded");
  assert.equal(out[1].fillId, FILL_B);
  assert.equal(out[1].observedAt, 200n);
  assert.equal(out[1].transition, "evm-leg-funded");
  assert.equal(out[2].fillId, FILL_B);
  assert.equal(out[2].observedAt, 300n);
  assert.equal(out[2].transition, "evm-leg-claimed");
});

test("reduceEVMEvents rejects a non-hex32 fill id", () => {
  assert.throws(() => reduceEVMEvents([event("funded", "0xnope", 100n)]));
});

test("reduceEVMEvents uses the injected block timestamp oracle", () => {
  const events: EVMEvent[] = [event("funded", FILL_A, 100n)];
  const out = reduceEVMEvents(events, { blockTimestamp: () => 999n });
  assert.equal(out[0].observedAt, 999n);
});
