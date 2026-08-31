import { balancedQuoteAtoms } from "./amm.ts";
import type { Market } from "./market-data.ts";

export type PoolShares = {
  reserveZecAtoms: bigint;
  reserveQuoteAtoms: bigint;
  totalShares: bigint;
};

export function lpOperationAllowed(operation: "mint" | "swap" | "burn", tradingPaused: boolean): boolean {
  if (operation === "burn") return true;
  return !tradingPaused;
}

export function emptyShareCopy(poolId: "ZEC/USDC" | "ZEC/USDT"): string {
  return `No session LP shares in ${poolId}. Burn stays idle until a local mint.`;
}

export function lpPauseNoticeCopy(
  settlementPair: Market["settlementPair"],
  paused: boolean,
): string {
  return paused
    ? `Trading paused. LP withdrawal remains available. Settled as ${settlementPair}.`
    : `Trading pause lifted. Mint and swap are available again. Settled as ${settlementPair}.`;
}

export function isLpPauseNotice(copy: string): boolean {
  return copy.startsWith("Trading paused.") || copy.startsWith("Trading pause lifted.");
}

export function lpResetNoticeCopy(settlementPair: Market["settlementPair"]): string {
  return `Local pool reserves restored. Settled as ${settlementPair}.`;
}

export function lpMintNoticeCopy(
  shares: bigint,
  settlementPair: Market["settlementPair"],
): string {
  return `Minted ${shares.toString()} local LP shares. Wallet actions stay disabled. Settled as ${settlementPair}.`;
}

export function lpBurnNoticeCopy(
  zecLabel: string,
  settlementPair: Market["settlementPair"],
): string {
  return `Burned session shares for ${zecLabel} ZEC. Local preview only. Settled as ${settlementPair}.`;
}

export function lpSwapNoticeCopy(
  outputLabel: string,
  quote: Market["quote"],
  settlementPair: Market["settlementPair"],
): string {
  return `Simulated ZEC→${quote} swap. Output ${outputLabel} ${quote}. Local preview only. Settled as ${settlementPair}.`;
}

export function seedPool(reserveZecAtoms: bigint, reserveQuoteAtoms: bigint): PoolShares {
  if (reserveZecAtoms <= 0n || reserveQuoteAtoms <= 0n) {
    throw new Error("Pool reserves must be positive");
  }
  return {
    reserveZecAtoms,
    reserveQuoteAtoms,
    totalShares: reserveZecAtoms,
  };
}

export function mintShares(
  pool: PoolShares,
  zecAtoms: bigint,
): { pool: PoolShares; shares: bigint; quoteAtoms: bigint } {
  if (zecAtoms <= 0n) {
    throw new Error("Value must be positive");
  }
  const quoteAtoms = balancedQuoteAtoms(zecAtoms, pool.reserveZecAtoms, pool.reserveQuoteAtoms);
  if (quoteAtoms <= 0n) {
    throw new Error("Amount is too small to produce one quote-token atom.");
  }
  const shares = (zecAtoms * pool.totalShares) / pool.reserveZecAtoms;
  if (shares <= 0n) {
    throw new Error("Amount is too small to mint one LP share.");
  }
  return {
    shares,
    quoteAtoms,
    pool: {
      reserveZecAtoms: pool.reserveZecAtoms + zecAtoms,
      reserveQuoteAtoms: pool.reserveQuoteAtoms + quoteAtoms,
      totalShares: pool.totalShares + shares,
    },
  };
}

export function burnShares(
  pool: PoolShares,
  shares: bigint,
): { pool: PoolShares; zecAtoms: bigint; quoteAtoms: bigint } {
  if (shares <= 0n || shares > pool.totalShares) {
    throw new Error("Share amount is outside the preview range");
  }
  const zecAtoms = (shares * pool.reserveZecAtoms) / pool.totalShares;
  const quoteAtoms = (shares * pool.reserveQuoteAtoms) / pool.totalShares;
  return {
    zecAtoms,
    quoteAtoms,
    pool: {
      reserveZecAtoms: pool.reserveZecAtoms - zecAtoms,
      reserveQuoteAtoms: pool.reserveQuoteAtoms - quoteAtoms,
      totalShares: pool.totalShares - shares,
    },
  };
}

export type ImpermanentLossPreview = {
  hodlQuoteAtoms: bigint;
  positionQuoteAtoms: bigint;
  lossQuoteAtoms: bigint;
};

export const IL_PRICE_SCENARIOS = [
  { label: "4x ZEC/quote", priceMultipleNumerator: 4n, priceMultipleDenominator: 1n },
  { label: "1/4x ZEC/quote", priceMultipleNumerator: 1n, priceMultipleDenominator: 4n },
] as const;

function integerSqrt(value: bigint): bigint {
  if (value < 0n) {
    throw new Error("Square root of a negative value");
  }
  if (value < 2n) {
    return value;
  }
  let guess = value;
  let next = (guess + 1n) / 2n;
  while (next < guess) {
    guess = next;
    next = (guess + value / guess) / 2n;
  }
  return guess;
}

function quoteValueAtoms(
  zecAtoms: bigint,
  quoteAtoms: bigint,
  reserveZecAtoms: bigint,
  reserveQuoteAtoms: bigint,
  rounding: "down" | "up",
): bigint {
  if (reserveZecAtoms <= 0n || reserveQuoteAtoms <= 0n) {
    throw new Error("Pool reserves must be positive");
  }
  if (zecAtoms < 0n || quoteAtoms < 0n) {
    throw new Error("Amounts must be non-negative");
  }
  const numerator = zecAtoms * reserveQuoteAtoms;
  const converted = rounding === "up" && numerator > 0n
    ? ((numerator - 1n) / reserveZecAtoms) + 1n
    : numerator / reserveZecAtoms;
  return quoteAtoms + converted;
}

function lossVersusHold(hodlQuoteAtoms: bigint, positionQuoteAtoms: bigint): ImpermanentLossPreview {
  return {
    hodlQuoteAtoms,
    positionQuoteAtoms,
    lossQuoteAtoms: hodlQuoteAtoms > positionQuoteAtoms ? hodlQuoteAtoms - positionQuoteAtoms : 0n,
  };
}

export function realizedImpermanentLoss(
  entryZecAtoms: bigint,
  entryQuoteAtoms: bigint,
  shares: bigint,
  pool: PoolShares,
): ImpermanentLossPreview {
  if (shares <= 0n || entryZecAtoms <= 0n || entryQuoteAtoms <= 0n) {
    return { hodlQuoteAtoms: 0n, positionQuoteAtoms: 0n, lossQuoteAtoms: 0n };
  }
  const position = burnShares(pool, shares);
  return lossVersusHold(
    quoteValueAtoms(entryZecAtoms, entryQuoteAtoms, pool.reserveZecAtoms, pool.reserveQuoteAtoms, "up"),
    quoteValueAtoms(position.zecAtoms, position.quoteAtoms, pool.reserveZecAtoms, pool.reserveQuoteAtoms, "down"),
  );
}

export function hypotheticalImpermanentLoss(
  entryZecAtoms: bigint,
  entryQuoteAtoms: bigint,
  priceMultipleNumerator: bigint,
  priceMultipleDenominator: bigint,
): ImpermanentLossPreview {
  if (entryZecAtoms <= 0n || entryQuoteAtoms <= 0n) {
    return { hodlQuoteAtoms: 0n, positionQuoteAtoms: 0n, lossQuoteAtoms: 0n };
  }
  if (priceMultipleNumerator <= 0n || priceMultipleDenominator <= 0n) {
    throw new Error("Price multiple must be positive");
  }
  const sqrtNum = integerSqrt(priceMultipleNumerator);
  const sqrtDen = integerSqrt(priceMultipleDenominator);
  if (sqrtNum * sqrtNum !== priceMultipleNumerator || sqrtDen * sqrtDen !== priceMultipleDenominator) {
    throw new Error("Price multiple must be a ratio of perfect squares");
  }

  const lpPzecAtoms = (entryZecAtoms * sqrtDen) / sqrtNum;
  const lpQuoteAtoms = (entryQuoteAtoms * sqrtNum) / sqrtDen;
  const hodlQuoteAtoms = entryQuoteAtoms + (entryQuoteAtoms * priceMultipleNumerator) / priceMultipleDenominator;
  const positionQuoteAtoms = lpQuoteAtoms
    + (lpPzecAtoms * entryQuoteAtoms * priceMultipleNumerator) / (entryZecAtoms * priceMultipleDenominator);
  return lossVersusHold(hodlQuoteAtoms, positionQuoteAtoms);
}
