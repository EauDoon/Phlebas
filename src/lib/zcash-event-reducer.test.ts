import { strict as assert } from "node:assert";
import { test } from "node:test";

import { outpointKey, reduceZcashEvents } from "./zcash-event-reducer.ts";
import type { ZcashOutpointEvent } from "./zcash-observer.ts";
import type { Hex32 } from "./order-domain.ts";

function event(
  kind: ZcashOutpointEvent["kind"],
  txid: string,
  vout: number,
  blockHeight: bigint,
): ZcashOutpointEvent {
  return {
    kind,
    txid,
    vout,
    address: "t1" + "aa".repeat(19),
    amountZatoshis: 1_000_000n,
    blockHeight,
  };
}

const FILL_A = ("0x" + "aa".repeat(32)) as Hex32;
const FILL_B = ("0x" + "bb".repeat(32)) as Hex32;

// The reducer needs a real clock for every event. These fixtures put the
// block a fixed distance into 2026 so a block height could never be
// mistaken for the timestamp derived from it.
const AT = (event: ZcashOutpointEvent): bigint => 1_780_000_000n + event.blockHeight;

test("outpointKey lowercases the txid and includes the vout", () => {
  assert.equal(outpointKey("0xABCD", 1), "0xabcd:1");
});

test("reduceZcashEvents skips events without a known fill id", () => {
  const events: ZcashOutpointEvent[] = [event("funded", "0xa", 0, 100n)];
  assert.equal(reduceZcashEvents(events, { blockTimestamp: AT }).length, 0);
});

test("reduceZcashEvents maps known events to transitions", () => {
  const events: ZcashOutpointEvent[] = [
    event("funded", "0xa", 0, 100n),
    event("claimed", "0xa", 0, 200n),
  ];
  const lookup = { [outpointKey("0xa", 0)]: FILL_A };
  const out = reduceZcashEvents(events, { fillIdByOutpoint: lookup, blockTimestamp: AT });
  assert.equal(out.length, 2);
  assert.equal(out[0].transition, "zec-leg-funded");
  assert.equal(out[1].transition, "zec-leg-claimed");
  assert.equal(out[0].fillId, FILL_A);
});

test("reduceZcashEvents sorts by observed timestamp then fill id", () => {
  const events: ZcashOutpointEvent[] = [
    event("claimed", "0xa", 0, 300n),
    event("funded", "0xa", 0, 100n),
    event("funded", "0xb", 0, 200n),
  ];
  const lookup: Record<string, Hex32> = {
    [outpointKey("0xa", 0)]: FILL_A,
    [outpointKey("0xb", 0)]: FILL_B,
  };
  const out = reduceZcashEvents(events, { fillIdByOutpoint: lookup, blockTimestamp: AT });
  assert.equal(out[0].fillId, FILL_A);
  assert.equal(out[0].transition, "zec-leg-funded");
  assert.equal(out[0].observedAt, 1_780_000_100n);
  assert.equal(out[1].fillId, FILL_B);
  assert.equal(out[1].transition, "zec-leg-funded");
  assert.equal(out[1].observedAt, 1_780_000_200n);
  assert.equal(out[2].fillId, FILL_A);
  assert.equal(out[2].transition, "zec-leg-claimed");
  assert.equal(out[2].observedAt, 1_780_000_300n);
});

test("reduceZcashEvents uses the injected block timestamp oracle", () => {
  const events: ZcashOutpointEvent[] = [event("funded", "0xa", 0, 100n)];
  const lookup = { [outpointKey("0xa", 0)]: FILL_A };
  const out = reduceZcashEvents(events, { fillIdByOutpoint: lookup, blockTimestamp: () => 7n });
  assert.equal(out[0].observedAt, 7n);
});

test("reduceZcashEvents rejects a non-hex32 fill id in the lookup", () => {
  const events: ZcashOutpointEvent[] = [event("funded", "0xa", 0, 100n)];
  const lookup = { [outpointKey("0xa", 0)]: "0xnope" as unknown as Hex32 };
  assert.throws(() => reduceZcashEvents(events, { fillIdByOutpoint: lookup, blockTimestamp: AT }));
});

test("reduceZcashEvents refuses to run without a block-timestamp source", () => {
  // The default this replaces used event.blockHeight, a count of blocks,
  // where the coordinator expects Unix seconds. A height near 2,600,000
  // read as a second is January 1970, and every deadline computed from it
  // is anchored to a moment that never existed.
  const events: ZcashOutpointEvent[] = [event("funded", "0xa", 0, 2_600_000n)];
  const lookup = { [outpointKey("0xa", 0)]: FILL_A };
  assert.throws(
    () => (reduceZcashEvents as (e: ZcashOutpointEvent[], o?: unknown) => unknown)(events, { fillIdByOutpoint: lookup }),
    /block-timestamp source/,
  );
});
