import assert from "node:assert/strict";
import test from "node:test";

import { quoteConstantProductSwapAtoms } from "./amm.ts";
import {
  burnShares,
  emptyShareCopy,
  isLpPauseNotice,
  lpPauseNoticeCopy,
  lpBurnNoticeCopy,
  lpMintNoticeCopy,
  lpResetNoticeCopy,
  lpSwapNoticeCopy,
  hypotheticalImpermanentLoss,
  lpOperationAllowed,
  mintShares,
  realizedImpermanentLoss,
  seedPool,
} from "./lp.ts";
import { markets, pools } from "./market-data.ts";
import { PZEC_DECIMALS, QUOTE_DECIMALS, formatAtomicUnits } from "./units.ts";

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
  assert.equal(emptyShareCopy("ZEC/USDC"), "No session LP shares in ZEC/USDC. Burn stays idle until a local mint.");
  assert.equal(emptyShareCopy("ZEC/USDT"), "No session LP shares in ZEC/USDT. Burn stays idle until a local mint.");
  assert.doesNotMatch(emptyShareCopy("ZEC/USDC"), /order book empty/i);
  assert.doesNotMatch(emptyShareCopy("ZEC/USDT"), /resting depth/i);
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
    "Trading paused. LP withdrawal remains available. Settled as ZEC-USDC.",
  );
  assert.equal(
    lpPauseNoticeCopy(markets["ZEC/USDT"].settlementPair, false),
    "Trading pause lifted. Mint and swap are available again. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(lpPauseNoticeCopy("ZEC-USDC", true), /native ZEC/);
});

test("LP pause notice names the newly selected pool after a switch while paused", () => {
  const usdcPaused = lpPauseNoticeCopy(markets["ZEC/USDC"].settlementPair, true);
  assert.equal(usdcPaused, "Trading paused. LP withdrawal remains available. Settled as ZEC-USDC.");
  assert.equal(isLpPauseNotice(usdcPaused), true);
  const usdt0Paused = lpPauseNoticeCopy(markets["ZEC/USDT"].settlementPair, true);
  assert.equal(usdt0Paused, "Trading paused. LP withdrawal remains available. Settled as ZEC-USDT.");
  assert.equal(isLpPauseNotice(usdt0Paused), true);
  const usdt0Lifted = lpPauseNoticeCopy(markets["ZEC/USDT"].settlementPair, false);
  assert.equal(
    usdt0Lifted,
    "Trading pause lifted. Mint and swap are available again. Settled as ZEC-USDT.",
  );
  assert.equal(isLpPauseNotice(usdt0Lifted), true);
  const minted = mintShares(seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms), 10_00000000n);
  assert.equal(
    isLpPauseNotice(lpMintNoticeCopy(minted.shares, markets["ZEC/USDC"].settlementPair)),
    false,
  );
});

test("LP lifted pause notice names the newly selected pool after a switch", () => {
  assert.equal(markets["ZEC/USDC"].settlementPair, "ZEC-USDC");
  assert.equal(markets["ZEC/USDT"].settlementPair, "ZEC-USDT");
  const usdcLifted = lpPauseNoticeCopy(markets["ZEC/USDC"].settlementPair, false);
  assert.equal(
    usdcLifted,
    "Trading pause lifted. Mint and swap are available again. Settled as ZEC-USDC.",
  );
  assert.equal(isLpPauseNotice(usdcLifted), true);
  const usdt0Lifted = lpPauseNoticeCopy(markets["ZEC/USDT"].settlementPair, false);
  assert.equal(
    usdt0Lifted,
    "Trading pause lifted. Mint and swap are available again. Settled as ZEC-USDT.",
  );
  assert.equal(isLpPauseNotice(usdt0Lifted), true);
  const minted = mintShares(seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms), 10_00000000n);
  assert.equal(
    isLpPauseNotice(lpMintNoticeCopy(minted.shares, markets["ZEC/USDC"].settlementPair)),
    false,
  );
});

test("LP pause notice names ZEC-USDT from a real USDT pool", () => {
  const pool = seedPool(pools[1].reserveZecAtoms, pools[1].reserveQuoteAtoms);
  assert.ok(pool.totalShares > 0n);
  assert.equal(pools[1].quote, "USDT");
  assert.equal(markets["ZEC/USDT"].settlementPair, "ZEC-USDT");
  assert.equal(lpOperationAllowed("mint", true), false);
  assert.equal(lpOperationAllowed("swap", true), false);
  assert.equal(lpOperationAllowed("burn", true), true);
  assert.equal(
    lpPauseNoticeCopy(markets["ZEC/USDT"].settlementPair, true),
    "Trading paused. LP withdrawal remains available. Settled as ZEC-USDT.",
  );
  assert.equal(
    lpPauseNoticeCopy(markets["ZEC/USDT"].settlementPair, false),
    "Trading pause lifted. Mint and swap are available again. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(
    lpPauseNoticeCopy(markets["ZEC/USDT"].settlementPair, true),
    /native ZEC/,
  );
});

test("LP reset notice names the selected pool settlement pair", () => {
  const pool = seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms);
  const minted = mintShares(pool, 10_00000000n);
  assert.ok(minted.shares > 0n);
  const restored = seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms);
  assert.equal(restored.reservePzecAtoms, pool.reservePzecAtoms);
  assert.equal(
    lpResetNoticeCopy(markets["ZEC/USDC"].settlementPair),
    "Local pool reserves restored. Settled as ZEC-USDC.",
  );
  assert.equal(
    lpResetNoticeCopy(markets["ZEC/USDT"].settlementPair),
    "Local pool reserves restored. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(lpResetNoticeCopy("ZEC-USDC"), /native ZEC/);
});

test("LP reset notice names ZEC-USDT from a real USDT mint then restore", () => {
  const pool = seedPool(pools[1].reserveZecAtoms, pools[1].reserveQuoteAtoms);
  const minted = mintShares(pool, 10_00000000n);
  assert.ok(minted.shares > 0n);
  assert.equal(pools[1].quote, "USDT");
  assert.equal(markets["ZEC/USDT"].settlementPair, "ZEC-USDT");
  const restored = seedPool(pools[1].reserveZecAtoms, pools[1].reserveQuoteAtoms);
  assert.equal(restored.reservePzecAtoms, pool.reservePzecAtoms);
  assert.equal(restored.reserveQuoteAtoms, pool.reserveQuoteAtoms);
  assert.equal(
    lpResetNoticeCopy(markets["ZEC/USDT"].settlementPair),
    "Local pool reserves restored. Settled as ZEC-USDT.",
  );
  assert.doesNotMatch(
    lpResetNoticeCopy(markets["ZEC/USDT"].settlementPair),
    /native ZEC/,
  );
});

test("LP mint notice names the settlement pair from a real mint", () => {
  const pool = seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms);
  const minted = mintShares(pool, 10_00000000n);
  assert.ok(minted.shares > 0n);
  assert.equal(
    lpMintNoticeCopy(minted.shares, markets["ZEC/USDC"].settlementPair),
    `Minted ${minted.shares.toString()} local LP shares. Wallet actions stay disabled. Settled as ZEC-USDC.`,
  );
  assert.match(lpMintNoticeCopy(minted.shares, markets["ZEC/USDT"].settlementPair), /ZEC-USDT/);
  assert.doesNotMatch(lpMintNoticeCopy(minted.shares, "ZEC-USDC"), /native ZEC/);
});

test("LP mint notice names ZEC-USDT from a real USDT mint", () => {
  const pool = seedPool(pools[1].reserveZecAtoms, pools[1].reserveQuoteAtoms);
  const minted = mintShares(pool, 10_00000000n);
  assert.ok(minted.shares > 0n);
  assert.equal(pools[1].quote, "USDT");
  assert.equal(markets["ZEC/USDT"].settlementPair, "ZEC-USDT");
  assert.equal(
    lpMintNoticeCopy(minted.shares, markets["ZEC/USDT"].settlementPair),
    `Minted ${minted.shares.toString()} local LP shares. Wallet actions stay disabled. Settled as ZEC-USDT.`,
  );
  assert.doesNotMatch(
    lpMintNoticeCopy(minted.shares, markets["ZEC/USDT"].settlementPair),
    /native ZEC/,
  );
});

test("LP burn notice names the settlement pair from a real mint then burn", () => {
  const pool = seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms);
  const minted = mintShares(pool, 10_00000000n);
  const burned = burnShares(minted.pool, minted.shares);
  assert.equal(burned.pzecAtoms, 10_00000000n);
  const pzecLabel = formatAtomicUnits(burned.pzecAtoms, PZEC_DECIMALS);
  assert.equal(
    lpBurnNoticeCopy(pzecLabel, markets["ZEC/USDC"].settlementPair),
    `Burned session shares for ${pzecLabel} ZEC. Local preview only. Settled as ZEC-USDC.`,
  );
  assert.match(lpBurnNoticeCopy(pzecLabel, markets["ZEC/USDT"].settlementPair), /ZEC-USDT/);
  assert.doesNotMatch(lpBurnNoticeCopy(pzecLabel, "ZEC-USDC"), /native ZEC/);
});

test("LP burn notice names ZEC-USDT from a real USDT mint then burn", () => {
  const pool = seedPool(pools[1].reserveZecAtoms, pools[1].reserveQuoteAtoms);
  const minted = mintShares(pool, 10_00000000n);
  const burned = burnShares(minted.pool, minted.shares);
  assert.ok(minted.shares > 0n);
  assert.equal(pools[1].quote, "USDT");
  assert.equal(markets["ZEC/USDT"].settlementPair, "ZEC-USDT");
  const pzecLabel = formatAtomicUnits(burned.pzecAtoms, PZEC_DECIMALS);
  assert.equal(
    lpBurnNoticeCopy(pzecLabel, markets["ZEC/USDT"].settlementPair),
    `Burned session shares for ${pzecLabel} ZEC. Local preview only. Settled as ZEC-USDT.`,
  );
  assert.doesNotMatch(
    lpBurnNoticeCopy(pzecLabel, markets["ZEC/USDT"].settlementPair),
    /native ZEC/,
  );
});

test("LP swap notice names the settlement pair from a real mint then swap", () => {
  const pool = seedPool(pools[0].reserveZecAtoms, pools[0].reserveQuoteAtoms);
  const minted = mintShares(pool, 10_00000000n);
  assert.ok(minted.shares > 0n);
  const swap = quoteConstantProductSwapAtoms(
    10_00000000n,
    minted.pool.reservePzecAtoms,
    minted.pool.reserveQuoteAtoms,
  );
  assert.ok(swap.amountOut > 0n);
  const outputLabel = formatAtomicUnits(swap.amountOut, QUOTE_DECIMALS, 2);
  assert.equal(
    lpSwapNoticeCopy(outputLabel, pools[0].quote, markets["ZEC/USDC"].settlementPair),
    `Simulated ZEC→USDC swap. Output ${outputLabel} USDC. Local preview only. Settled as ZEC-USDC.`,
  );
  assert.match(
    lpSwapNoticeCopy(outputLabel, pools[1].quote, markets["ZEC/USDT"].settlementPair),
    /ZEC-USDT/,
  );
  assert.doesNotMatch(
    lpSwapNoticeCopy(outputLabel, pools[0].quote, "ZEC-USDC"),
    /native ZEC/,
  );
});

test("LP swap notice names ZEC-USDT from a real USDT mint then swap", () => {
  const pool = seedPool(pools[1].reserveZecAtoms, pools[1].reserveQuoteAtoms);
  const minted = mintShares(pool, 10_00000000n);
  assert.ok(minted.shares > 0n);
  const swap = quoteConstantProductSwapAtoms(
    10_00000000n,
    minted.pool.reservePzecAtoms,
    minted.pool.reserveQuoteAtoms,
  );
  assert.ok(swap.amountOut > 0n);
  assert.equal(pools[1].quote, "USDT");
  assert.equal(markets["ZEC/USDT"].settlementPair, "ZEC-USDT");
  const outputLabel = formatAtomicUnits(swap.amountOut, QUOTE_DECIMALS, 2);
  assert.equal(
    lpSwapNoticeCopy(outputLabel, pools[1].quote, markets["ZEC/USDT"].settlementPair),
    `Simulated ZEC→USDT swap. Output ${outputLabel} USDT. Local preview only. Settled as ZEC-USDT.`,
  );
  assert.doesNotMatch(
    lpSwapNoticeCopy(outputLabel, pools[1].quote, markets["ZEC/USDT"].settlementPair),
    /native ZEC/,
  );
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
