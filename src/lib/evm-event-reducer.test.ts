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

// The reducer needs a real clock for every event. These fixtures put the
// block a fixed distance into 2026 so a block number could never be
// mistaken for the timestamp derived from it.
const AT = (event: EVMEvent): bigint => 1_780_000_000n + event.blockNumber;

const FILL_A = "0x" + "aa".repeat(32);
const FILL_B = "0x" + "bb".repeat(32);

test("reduceEVMEvents maps every event to a transition", () => {
  const events: EVMEvent[] = [
    event("funded", FILL_A, 100n),
    event("claimed", FILL_A, 200n),
    event("refunded", FILL_B, 250n),
  ];
  const out = reduceEVMEvents(events, { blockTimestamp: AT });
  assert.equal(out.length, 3);
  assert.equal(out[0].transition, "evm-leg-funded");
  assert.equal(out[1].transition, "evm-leg-claimed");
  assert.equal(out[2].transition, "evm-leg-refunded");
});

test("reduceEVMEvents returns an empty array for no events", () => {
  assert.equal(reduceEVMEvents([], { blockTimestamp: AT }).length, 0);
});

test("reduceEVMEvents sorts by observed timestamp then fill id", () => {
  const events: EVMEvent[] = [
    event("claimed", FILL_B, 300n),
    event("funded", FILL_A, 100n),
    event("funded", FILL_B, 200n),
  ];
  const out = reduceEVMEvents(events, { blockTimestamp: AT });
  assert.equal(out[0].fillId, FILL_A);
  assert.equal(out[0].observedAt, AT(event("funded", FILL_A, 100n)));
  assert.equal(out[0].transition, "evm-leg-funded");
  assert.equal(out[1].fillId, FILL_B);
  assert.equal(out[1].observedAt, AT(event("funded", FILL_B, 200n)));
  assert.equal(out[1].transition, "evm-leg-funded");
  assert.equal(out[2].fillId, FILL_B);
  assert.equal(out[2].observedAt, AT(event("claimed", FILL_B, 300n)));
  assert.equal(out[2].transition, "evm-leg-claimed");
});

test("reduceEVMEvents rejects a non-hex32 fill id", () => {
  assert.throws(() => reduceEVMEvents([event("funded", "0xnope", 100n)], { blockTimestamp: AT }));
});

test("reduceEVMEvents uses the injected block timestamp oracle", () => {
  const events: EVMEvent[] = [event("funded", FILL_A, 100n)];
  const out = reduceEVMEvents(events, { blockTimestamp: () => 999n });
  assert.equal(out[0].observedAt, 999n);
});

test("reduceEVMEvents refuses to run without a block-timestamp source", () => {
  // The default this replaces used event.blockNumber, and the comment on
  // it claimed to be reading a timestamp off the event. EVMEvent has no
  // such field. observedAt reaches the coordinator as nowSeconds and goes
  // into deadline arithmetic, so a height near 18,500,000 read as a Unix
  // second anchors every derived deadline to mid-1970.
  const events = [event("funded", FILL_A, 18_500_000n)];
  assert.throws(
    () => (reduceEVMEvents as (e: EVMEvent[], o?: unknown) => unknown)(events),
    /block-timestamp source/,
  );
  assert.throws(
    () => (reduceEVMEvents as (e: EVMEvent[], o?: unknown) => unknown)(events, {}),
    /block-timestamp source/,
  );
});
