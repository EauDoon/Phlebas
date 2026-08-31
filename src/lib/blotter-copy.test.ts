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
    blotterEmptyOrdersCopy("pZEC-USDC"),
    "No open session orders. Settled as pZEC-USDC. Venue fixture levels remain on the book.",
  );
  assert.equal(
    blotterEmptyOrdersCopy("pZEC-USDT0"),
    "No open session orders. Settled as pZEC-USDT0. Venue fixture levels remain on the book.",
  );
  assert.match(blotterEmptyFillsCopy("pZEC-USDC"), /pZEC-USDC/);
  assert.doesNotMatch(blotterEmptyOrdersCopy("pZEC-USDC"), /native ZEC/);
});

test("blotter log empty copy names the settlement pair", () => {
  assert.equal(
    blotterEmptyLogCopy("pZEC-USDC"),
    "No session events yet. Settled as pZEC-USDC. Replaying this log reconstructs the book and balances.",
  );
  assert.equal(
    blotterEmptyLogCopy("pZEC-USDT0"),
    "No session events yet. Settled as pZEC-USDT0. Replaying this log reconstructs the book and balances.",
  );
  assert.doesNotMatch(blotterEmptyLogCopy("pZEC-USDC"), /native ZEC/);
  assert.doesNotMatch(blotterEmptyLogCopy("pZEC-USDT0"), /live/);
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
    "buy GTC user-1 expiry 4102444800. Settled as pZEC-USDC.",
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
    "sell IOC user-2 expiry none. Settled as pZEC-USDT0.",
  );
  assert.equal(
    blotterLogEventCopy({ kind: "cancel", marketId: "ZEC/USDT", orderId: "user-2" }),
    "user-2. Settled as pZEC-USDT0.",
  );
  assert.equal(blotterLogEventCopy({ kind: "reset" }), "session reset");
  assert.equal(
    blotterLogCaptionCopy("pZEC-USDC"),
    "Append-only session event log. Current market settles as pZEC-USDC.",
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
