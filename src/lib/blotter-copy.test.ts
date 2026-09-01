import assert from "node:assert/strict";
import test from "node:test";

import {
  blotterCancelRefundCopy,
  blotterEmptyFillsCopy,
  blotterEmptyLogCopy,
  blotterEmptyOrdersCopy,
  blotterLogCaptionCopy,
  blotterLogEventCopy,
} from "./blotter-copy.ts";
import { ticketReviewRefundCopy } from "./ticket-review-copy.ts";

const BANNED_LABEL = /simulation|simulator|fixture|no-value|inspect|walkthrough|preview-only|illustrative fixture/i;

test("blotter empty copy names the settlement pair", () => {
  assert.equal(
    blotterEmptyOrdersCopy("ZEC-USDC"),
    "No open session orders. Settled as ZEC-USDC.",
  );
  assert.equal(
    blotterEmptyOrdersCopy("ZEC-USDT"),
    "No open session orders. Settled as ZEC-USDT.",
  );
  assert.match(blotterEmptyFillsCopy("ZEC-USDC"), /ZEC-USDC/);
  assert.equal(blotterEmptyFillsCopy("ZEC-USDT"), "No session fills yet. Settled as ZEC-USDT.");
  assert.doesNotMatch(blotterEmptyOrdersCopy("ZEC-USDC"), /native ZEC/);
  assert.doesNotMatch(blotterEmptyOrdersCopy("ZEC-USDC"), BANNED_LABEL);
  assert.doesNotMatch(blotterEmptyFillsCopy("ZEC-USDC"), BANNED_LABEL);
});

test("blotter log empty copy names the settlement pair", () => {
  assert.equal(
    blotterEmptyLogCopy("ZEC-USDC"),
    "No session events yet. Settled as ZEC-USDC.",
  );
  assert.equal(
    blotterEmptyLogCopy("ZEC-USDT"),
    "No session events yet. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(blotterEmptyLogCopy("ZEC-USDC"), /native ZEC/);
  assert.doesNotMatch(blotterEmptyLogCopy("ZEC-USDC"), /live/);
  assert.doesNotMatch(blotterEmptyLogCopy("ZEC-USDT"), BANNED_LABEL);
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
    "buy GTC expiry 4102444800. Settled as ZEC-USDC.",
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
      expiryUnix: 0n,
    }),
    "sell IOC expiry none. Settled as ZEC-USDT.",
  );
  assert.equal(
    blotterLogEventCopy({ kind: "cancel", marketId: "ZEC/USDT", orderId: "user-2" }),
    "Cancelled. Settled as ZEC-USDT.",
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
    expiryUnix: 0n,
  }), /native ZEC/);
  assert.doesNotMatch(blotterLogEventCopy({
    kind: "submit",
    marketId: "ZEC/USDC",
    id: "user-1",
    side: "buy",
    tif: "GTC",
    priceTicks: 1n,
    sizeAtoms: 1n,
    expiryUnix: 0n,
  }), /user-1/);
});

test("blotter keeps cancel and refund copy visible", () => {
  assert.match(blotterCancelRefundCopy(), /Cancel returns reserved size/);
  assert.match(blotterCancelRefundCopy(), /refund/i);
  assert.equal(blotterCancelRefundCopy(), `Cancel returns reserved size. ${ticketReviewRefundCopy()}`);
  assert.doesNotMatch(blotterCancelRefundCopy(), BANNED_LABEL);
});
