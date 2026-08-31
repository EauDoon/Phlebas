import assert from "node:assert/strict";
import test from "node:test";

import { cancelNonce, emptyNonceBitmap, isNonceCancelled } from "./nonce-bitmap.ts";

test("cancelNonce sets the same bit layout as Settlement.sol", () => {
  const empty = emptyNonceBitmap();
  assert.equal(isNonceCancelled(empty, 1n), false);
  const one = cancelNonce(empty, 1n);
  assert.equal(isNonceCancelled(one, 1n), true);
  assert.equal(isNonceCancelled(one, 257n), false);
  const both = cancelNonce(one, 257n);
  assert.equal(isNonceCancelled(both, 1n), true);
  assert.equal(isNonceCancelled(both, 257n), true);
  assert.equal(isNonceCancelled(both, 2n), false);
});
