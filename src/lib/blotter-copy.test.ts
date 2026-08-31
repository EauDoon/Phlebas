import assert from "node:assert/strict";
import test from "node:test";

import {
  blotterEmptyFillsCopy,
  blotterEmptyLogCopy,
  blotterEmptyOrdersCopy,
  blotterLogCaptionCopy,
  blotterLogEventCopy,
} from "./blotter-copy.ts";

test("blotter empty copy names the settlement pair", () => {
  assert.equal(
    blotterEmptyOrdersCopy("ZEC-USDC"),
    "No open session orders. Settled as ZEC-USDC. Venue fixture levels remain on the book.",
  );
  assert.equal(
    blotterEmptyOrdersCopy("ZEC-USDT"),
    "No open session orders. Settled as ZEC-USDT. Venue fixture levels remain on the book.",
  );
  assert.match(blotterEmptyFillsCopy("ZEC-USDC"), /ZEC-USDC/);
  assert.doesNotMatch(blotterEmptyOrdersCopy("ZEC-USDC"), /native ZEC/);
});

test("blotter log empty copy names the settlement pair", () => {
  assert.equal(
    blotterEmptyLogCopy("ZEC-USDC"),
    "No session events yet. Settled as ZEC-USDC. Replaying this log reconstructs the book and balances.",
  );
  assert.equal(
    blotterEmptyLogCopy("ZEC-USDT"),
    "No session events yet. Settled as ZEC-USDT. Replaying this log reconstructs the book and balances.",
  );
  assert.doesNotMatch(blotterEmptyLogCopy("ZEC-USDC"), /native ZEC/);
  assert.doesNotMatch(blotterEmptyLogCopy("ZEC-USDT"), /live/);
});

test("blotter log event copy names the event market settlement pair", () => {
  assert.equal(
    blotterLogEventCopy({
      kind: "submit",
      marketId: "ZEC/USDC",
      id: "user-1",
      side: "buy",
      tif: "GTC",
      priceTicks: 5284n,
      sizeAtoms: 1_00000000n,
      expiryUnix: 4102444800n,
    }),
    "buy GTC user-1 expiry 4102444800. Settled as ZEC-USDC.",
  );
  assert.equal(
    blotterLogEventCopy({
      kind: "submit",
      marketId: "ZEC/USDT",
      id: "user-2",
      side: "sell",
      tif: "IOC",
      priceTicks: 5279n,
      sizeAtoms: 1_00000000n,
    }),
    "sell IOC user-2 expiry none. Settled as ZEC-USDT.",
  );
  assert.equal(
    blotterLogEventCopy({ kind: "cancel", marketId: "ZEC/USDT", orderId: "user-2" }),
    "user-2. Settled as ZEC-USDT.",
  );
  assert.equal(blotterLogEventCopy({ kind: "reset" }), "session reset");
  assert.equal(
    blotterLogCaptionCopy("ZEC-USDC"),
    "Append-only session event log. Current market settles as ZEC-USDC.",
  );
  assert.doesNotMatch(blotterLogEventCopy({
    kind: "submit",
    marketId: "ZEC/USDC",
    id: "user-1",
    side: "buy",
    tif: "GTC",
    priceTicks: 1n,
    sizeAtoms: 1n,
  }), /native ZEC/);
});
