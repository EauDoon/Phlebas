import { balancedQuoteAtoms } from "./amm.ts";
import type { Market } from "./market-data.ts";

export type PoolShares = {
  reservePzecAtoms: bigint;
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
  pzecLabel: string,
  settlementPair: Market["settlementPair"],
): string {
  return `Burned session shares for ${pzecLabel} ZEC. Local preview only. Settled as ${settlementPair}.`;
}

export function lpSwapNoticeCopy(
  outputLabel: string,
  quote: Market["quote"],
  settlementPair: Market["settlementPair"],
): string {
  return `Simulated ZEC→${quote} swap. Output ${outputLabel} ${quote}. Local preview only. Settled as ${settlementPair}.`;
}

export function seedPool(reservePzecAtoms: bigint, reserveQuoteAtoms: bigint): PoolShares {
  if (reservePzecAtoms <= 0n || reserveQuoteAtoms <= 0n) {
    throw new Error("Pool reserves must be positive");
  }
  return {
    reservePzecAtoms,
    reserveQuoteAtoms,
    totalShares: reservePzecAtoms,
  };
}

export function mintShares(
  pool: PoolShares,
  pzecAtoms: bigint,
): { pool: PoolShares; shares: bigint; quoteAtoms: bigint } {
  if (pzecAtoms <= 0n) {
    throw new Error("Value must be positive");
  }
  const quoteAtoms = balancedQuoteAtoms(pzecAtoms, pool.reservePzecAtoms, pool.reserveQuoteAtoms);
  if (quoteAtoms <= 0n) {
    throw new Error("Amount is too small to produce one quote-token atom.");
  }
  const shares = (pzecAtoms * pool.totalShares) / pool.reservePzecAtoms;
  if (shares <= 0n) {
    throw new Error("Amount is too small to mint one LP share.");
  }
  return {
    shares,
    quoteAtoms,
    pool: {
      reservePzecAtoms: pool.reservePzecAtoms + pzecAtoms,
      reserveQuoteAtoms: pool.reserveQuoteAtoms + quoteAtoms,
      totalShares: pool.totalShares + shares,
    },
  };
}

export function burnShares(
  pool: PoolShares,
  shares: bigint,
): { pool: PoolShares; pzecAtoms: bigint; quoteAtoms: bigint } {
  if (shares <= 0n || shares > pool.totalShares) {
    throw new Error("Share amount is outside the preview range");
  }
  const pzecAtoms = (shares * pool.reservePzecAtoms) / pool.totalShares;
  const quoteAtoms = (shares * pool.reserveQuoteAtoms) / pool.totalShares;
  return {
    pzecAtoms,
    quoteAtoms,
    pool: {
      reservePzecAtoms: pool.reservePzecAtoms - pzecAtoms,
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
  { label: "4x pZEC/quote", priceMultipleNumerator: 4n, priceMultipleDenominator: 1n },
  { label: "1/4x pZEC/quote", priceMultipleNumerator: 1n, priceMultipleDenominator: 4n },
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
  pzecAtoms: bigint,
  quoteAtoms: bigint,
  reservePzecAtoms: bigint,
  reserveQuoteAtoms: bigint,
  rounding: "down" | "up",
): bigint {
  if (reservePzecAtoms <= 0n || reserveQuoteAtoms <= 0n) {
    throw new Error("Pool reserves must be positive");
  }
  if (pzecAtoms < 0n || quoteAtoms < 0n) {
    throw new Error("Amounts must be non-negative");
  }
  const numerator = pzecAtoms * reserveQuoteAtoms;
  const converted = rounding === "up" && numerator > 0n
    ? ((numerator - 1n) / reservePzecAtoms) + 1n
    : numerator / reservePzecAtoms;
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
  entryPzecAtoms: bigint,
  entryQuoteAtoms: bigint,
  shares: bigint,
  pool: PoolShares,
): ImpermanentLossPreview {
  if (shares <= 0n || entryPzecAtoms <= 0n || entryQuoteAtoms <= 0n) {
    return { hodlQuoteAtoms: 0n, positionQuoteAtoms: 0n, lossQuoteAtoms: 0n };
  }
  const position = burnShares(pool, shares);
  return lossVersusHold(
    quoteValueAtoms(entryPzecAtoms, entryQuoteAtoms, pool.reservePzecAtoms, pool.reserveQuoteAtoms, "up"),
    quoteValueAtoms(position.pzecAtoms, position.quoteAtoms, pool.reservePzecAtoms, pool.reserveQuoteAtoms, "down"),
  );
}

export function hypotheticalImpermanentLoss(
  entryPzecAtoms: bigint,
  entryQuoteAtoms: bigint,
  priceMultipleNumerator: bigint,
  priceMultipleDenominator: bigint,
): ImpermanentLossPreview {
  if (entryPzecAtoms <= 0n || entryQuoteAtoms <= 0n) {
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

  const lpPzecAtoms = (entryPzecAtoms * sqrtDen) / sqrtNum;
  const lpQuoteAtoms = (entryQuoteAtoms * sqrtNum) / sqrtDen;
  const hodlQuoteAtoms = entryQuoteAtoms + (entryQuoteAtoms * priceMultipleNumerator) / priceMultipleDenominator;
  const positionQuoteAtoms = lpQuoteAtoms
    + (lpPzecAtoms * entryQuoteAtoms * priceMultipleNumerator) / (entryPzecAtoms * priceMultipleDenominator);
  return lossVersusHold(hodlQuoteAtoms, positionQuoteAtoms);
}
