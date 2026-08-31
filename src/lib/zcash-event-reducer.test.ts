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

test("outpointKey lowercases the txid and includes the vout", () => {
  assert.equal(outpointKey("0xABCD", 1), "0xabcd:1");
});

test("reduceZcashEvents skips events without a known fill id", () => {
  const events: ZcashOutpointEvent[] = [event("funded", "0xa", 0, 100n)];
  assert.equal(reduceZcashEvents(events).length, 0);
});

test("reduceZcashEvents maps known events to transitions", () => {
  const events: ZcashOutpointEvent[] = [
    event("funded", "0xa", 0, 100n),
    event("claimed", "0xa", 0, 200n),
  ];
  const lookup = { [outpointKey("0xa", 0)]: FILL_A };
  const out = reduceZcashEvents(events, { fillIdByOutpoint: lookup });
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
  const out = reduceZcashEvents(events, { fillIdByOutpoint: lookup });
  assert.equal(out[0].fillId, FILL_A);
  assert.equal(out[0].transition, "zec-leg-funded");
  assert.equal(out[0].observedAt, 100n);
  assert.equal(out[1].fillId, FILL_B);
  assert.equal(out[1].transition, "zec-leg-funded");
  assert.equal(out[1].observedAt, 200n);
  assert.equal(out[2].fillId, FILL_A);
  assert.equal(out[2].transition, "zec-leg-claimed");
  assert.equal(out[2].observedAt, 300n);
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
  assert.throws(() => reduceZcashEvents(events, { fillIdByOutpoint: lookup }));
});
