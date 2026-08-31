import assert from "node:assert/strict";
import test from "node:test";

import { blotterEmptyFillsCopy, blotterEmptyLogCopy, blotterEmptyOrdersCopy } from "./blotter-copy.ts";

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
