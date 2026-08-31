import assert from "node:assert/strict";
import test from "node:test";

import { burnShares, lpOperationAllowed, mintShares, seedPool } from "./lp.ts";
import { pools } from "./market-data.ts";

test("mint then burn returns the added reserves on a fresh pool ratio", () => {
  const pool = seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms);
  const minted = mintShares(pool, 10_00000000n);
  assert.ok(minted.shares > 0n);
  assert.equal(minted.pool.reservePzecAtoms, pool.reservePzecAtoms + 10_00000000n);

  const burned = burnShares(minted.pool, minted.shares);
  assert.equal(burned.pzecAtoms, 10_00000000n);
  assert.equal(burned.quoteAtoms, minted.quoteAtoms);
  assert.equal(burned.pool.reservePzecAtoms, pool.reservePzecAtoms);
  assert.equal(burned.pool.totalShares, pool.totalShares);
});

test("rejects a zero mint", () => {
  const pool = seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms);
  assert.throws(() => mintShares(pool, 0n), /positive/);
});

test("LP burn stays available when trading is paused", () => {
  assert.equal(lpOperationAllowed("burn", true), true);
  assert.equal(lpOperationAllowed("mint", true), false);
  assert.equal(lpOperationAllowed("swap", true), false);
  assert.equal(lpOperationAllowed("mint", false), true);
  assert.equal(lpOperationAllowed("swap", false), true);
});
