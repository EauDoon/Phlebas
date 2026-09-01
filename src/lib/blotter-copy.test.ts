import assert from "node:assert/strict";
import test from "node:test";

import {
  blotterCancelRefundCopy,
  blotterEmptyFillsCopy,
  blotterEmptyLogCopy,
  blotterEmptyOrdersCopy,
  blotterFillsCaptionCopy,
  blotterLogCaptionCopy,
  blotterLogEventCopy,
  blotterOrdersCaptionCopy,
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
  assert.equal(blotterEmptyFillsCopy("ZEC-USDC"), "No session fills yet. Settled as ZEC-USDC.");
  assert.equal(blotterEmptyFillsCopy("ZEC-USDT"), "No session fills yet. Settled as ZEC-USDT.");
  assert.doesNotMatch(blotterEmptyOrdersCopy("ZEC-USDC"), /native ZEC/);
  assert.doesNotMatch(blotterEmptyOrdersCopy("ZEC-USDC"), BANNED_LABEL);
  assert.doesNotMatch(blotterEmptyFillsCopy("ZEC-USDC"), BANNED_LABEL);
  assert.doesNotMatch(blotterEmptyFillsCopy("ZEC-USDT"), BANNED_LABEL);
});

test("blotter table captions name the market and settlement pair", () => {
  assert.equal(
    blotterOrdersCaptionCopy("ZEC/USDC", "ZEC-USDC"),
    "Resting session orders on the local ZEC/USDC book, settled as ZEC-USDC",
  );
  assert.equal(
    blotterOrdersCaptionCopy("ZEC/USDT", "ZEC-USDT"),
    "Resting session orders on the local ZEC/USDT book, settled as ZEC-USDT",
  );
  assert.equal(
    blotterFillsCaptionCopy("ZEC/USDC", "ZEC-USDC"),
    "Session fills for ZEC/USDC, settled as ZEC-USDC",
  );
  assert.equal(
    blotterFillsCaptionCopy("ZEC/USDT", "ZEC-USDT"),
    "Session fills for ZEC/USDT, settled as ZEC-USDT",
  );
  assert.doesNotMatch(blotterOrdersCaptionCopy("ZEC/USDC", "ZEC-USDC"), /native ZEC/);
  assert.doesNotMatch(blotterFillsCaptionCopy("ZEC/USDT", "ZEC-USDT"), /native ZEC/);
  assert.doesNotMatch(blotterOrdersCaptionCopy("ZEC/USDC", "ZEC-USDC"), BANNED_LABEL);
  assert.doesNotMatch(blotterFillsCaptionCopy("ZEC/USDC", "ZEC-USDC"), BANNED_LABEL);
  assert.doesNotMatch(blotterOrdersCaptionCopy("ZEC/USDT", "ZEC-USDT"), /\bsimulation\b/i);
  assert.doesNotMatch(blotterFillsCaptionCopy("ZEC/USDT", "ZEC-USDT"), /\bsimulator\b/i);
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
  assert.equal(
    blotterLogCaptionCopy("ZEC-USDT"),
    "Append-only session event log. Current market settles as ZEC-USDT.",
  );
  assert.doesNotMatch(blotterLogCaptionCopy("ZEC-USDT"), BANNED_LABEL);
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

test("blotter labels stay venue copy without simulation vocabulary", () => {
  const shipped = [
    blotterEmptyOrdersCopy("ZEC-USDC"),
    blotterEmptyOrdersCopy("ZEC-USDT"),
    blotterEmptyFillsCopy("ZEC-USDC"),
    blotterEmptyFillsCopy("ZEC-USDT"),
    blotterEmptyLogCopy("ZEC-USDC"),
    blotterEmptyLogCopy("ZEC-USDT"),
    blotterOrdersCaptionCopy("ZEC/USDC", "ZEC-USDC"),
    blotterOrdersCaptionCopy("ZEC/USDT", "ZEC-USDT"),
    blotterFillsCaptionCopy("ZEC/USDC", "ZEC-USDC"),
    blotterFillsCaptionCopy("ZEC/USDT", "ZEC-USDT"),
    blotterLogCaptionCopy("ZEC-USDC"),
    blotterLogCaptionCopy("ZEC-USDT"),
    blotterCancelRefundCopy(),
    blotterLogEventCopy({
      kind: "submit",
      marketId: "ZEC/USDC",
      id: "user-1",
      side: "buy",
      tif: "GTC",
      priceTicks: 1n,
      sizeAtoms: 1n,
      expiryUnix: 0n,
    }),
    blotterLogEventCopy({ kind: "cancel", marketId: "ZEC/USDT", orderId: "user-2" }),
    blotterLogEventCopy({ kind: "reset" }),
  ].join("\n");
  assert.doesNotMatch(shipped, BANNED_LABEL);
  assert.doesNotMatch(shipped, /\bsimulation\b/i);
  assert.doesNotMatch(shipped, /\bsimulator\b/i);
});
