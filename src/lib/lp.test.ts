import assert from "node:assert/strict";
import test from "node:test";

import { quoteConstantProductSwapAtoms } from "./amm.ts";
import {
  burnShares,
  emptyShareCopy,
  lpPauseNoticeCopy,
  lpMintNoticeCopy,
  lpResetNoticeCopy,
  hypotheticalImpermanentLoss,
  lpOperationAllowed,
  mintShares,
  realizedImpermanentLoss,
  seedPool,
} from "./lp.ts";
import { markets, pools } from "./market-data.ts";

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

test("empty share copy names the selected pool and is not a book-empty notice", () => {
  assert.equal(emptyShareCopy("pZEC/USDC"), "No session LP shares in pZEC/USDC. Burn stays idle until a local mint.");
  assert.equal(emptyShareCopy("pZEC/USDT0"), "No session LP shares in pZEC/USDT0. Burn stays idle until a local mint.");
  assert.doesNotMatch(emptyShareCopy("pZEC/USDC"), /order book empty/i);
  assert.doesNotMatch(emptyShareCopy("pZEC/USDT0"), /resting depth/i);
});

test("LP burn stays available when trading is paused", () => {
  assert.equal(lpOperationAllowed("burn", true), true);
  assert.equal(lpOperationAllowed("mint", true), false);
  assert.equal(lpOperationAllowed("swap", true), false);
  assert.equal(lpOperationAllowed("mint", false), true);
  assert.equal(lpOperationAllowed("swap", false), true);
});

test("LP pause notice names the selected pool settlement pair", () => {
  const pool = seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms);
  assert.ok(pool.totalShares > 0n);
  assert.equal(lpOperationAllowed("mint", true), false);
  assert.equal(
    lpPauseNoticeCopy(markets["ZEC/USDC"].settlementPair, true),
    "Trading paused. LP withdrawal remains available. Settled as pZEC-USDC.",
  );
  assert.equal(
    lpPauseNoticeCopy(markets["ZEC/USDT"].settlementPair, false),
    "Trading pause lifted. Mint and swap are available again. Settled as pZEC-USDT0.",
  );
  assert.doesNotMatch(lpPauseNoticeCopy("pZEC-USDC", true), /native ZEC/);
});

test("LP reset notice names the selected pool settlement pair", () => {
  const pool = seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms);
  const minted = mintShares(pool, 10_00000000n);
  assert.ok(minted.shares > 0n);
  const restored = seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms);
  assert.equal(restored.reservePzecAtoms, pool.reservePzecAtoms);
  assert.equal(
    lpResetNoticeCopy(markets["ZEC/USDC"].settlementPair),
    "Local pool reserves restored. Settled as pZEC-USDC.",
  );
  assert.equal(
    lpResetNoticeCopy(markets["ZEC/USDT"].settlementPair),
    "Local pool reserves restored. Settled as pZEC-USDT0.",
  );
  assert.doesNotMatch(lpResetNoticeCopy("pZEC-USDC"), /native ZEC/);
});

test("LP mint notice names the settlement pair from a real mint", () => {
  const pool = seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms);
  const minted = mintShares(pool, 10_00000000n);
  assert.ok(minted.shares > 0n);
  assert.equal(
    lpMintNoticeCopy(minted.shares, markets["ZEC/USDC"].settlementPair),
    `Minted ${minted.shares.toString()} local LP shares. Wallet actions stay disabled. Settled as pZEC-USDC.`,
  );
  assert.match(lpMintNoticeCopy(minted.shares, markets["ZEC/USDT"].settlementPair), /pZEC-USDT0/);
  assert.doesNotMatch(lpMintNoticeCopy(minted.shares, "pZEC-USDC"), /native ZEC/);
});

test("hypothetical 4x IL equals the deposited quote on an even size", () => {
  const entryPzec = 10_00000000n;
  const entryQuote = 5_284000n;
  const fourX = hypotheticalImpermanentLoss(entryPzec, entryQuote, 4n, 1n);
  assert.equal(fourX.hodlQuoteAtoms, entryQuote * 5n);
  assert.equal(fourX.positionQuoteAtoms, entryQuote * 4n);
  assert.equal(fourX.lossQuoteAtoms, entryQuote);

  const quarter = hypotheticalImpermanentLoss(entryPzec, entryQuote, 1n, 4n);
  assert.equal(quarter.hodlQuoteAtoms, entryQuote + entryQuote / 4n);
  assert.equal(quarter.positionQuoteAtoms, entryQuote);
  assert.equal(quarter.lossQuoteAtoms, entryQuote / 4n);

  const unchanged = hypotheticalImpermanentLoss(entryPzec, entryQuote, 1n, 1n);
  assert.equal(unchanged.lossQuoteAtoms, 0n);
});

test("hypothetical IL rejects a non-square price multiple", () => {
  assert.throws(() => hypotheticalImpermanentLoss(10_00000000n, 5_284000n, 2n, 1n), /perfect squares/);
});

test("realized IL is zero at the entry ratio and positive after a large swap", () => {
  const pool = seedPool(100_00000000n, 100_000000n);
  const minted = mintShares(pool, 10_00000000n);
  const atEntry = realizedImpermanentLoss(10_00000000n, minted.quoteAtoms, minted.shares, minted.pool);
  assert.equal(atEntry.lossQuoteAtoms, 0n);

  const swap = quoteConstantProductSwapAtoms(
    40_00000000n,
    minted.pool.reservePzecAtoms,
    minted.pool.reserveQuoteAtoms,
  );
  const afterSwap = {
    ...minted.pool,
    reservePzecAtoms: minted.pool.reservePzecAtoms + 40_00000000n,
    reserveQuoteAtoms: minted.pool.reserveQuoteAtoms - swap.amountOut,
  };
  const after = realizedImpermanentLoss(10_00000000n, minted.quoteAtoms, minted.shares, afterSwap);
  assert.ok(after.lossQuoteAtoms > 0n);
  assert.ok(after.hodlQuoteAtoms > after.positionQuoteAtoms);
});
