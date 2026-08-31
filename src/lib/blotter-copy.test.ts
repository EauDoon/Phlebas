import assert from "node:assert/strict";
import test from "node:test";

import { blotterEmptyFillsCopy, blotterEmptyOrdersCopy } from "./blotter-copy.ts";

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
