import { balancedQuoteAtoms } from "./amm.ts";

export type PoolShares = {
  reservePzecAtoms: bigint;
  reserveQuoteAtoms: bigint;
  totalShares: bigint;
};

export function lpOperationAllowed(operation: "mint" | "swap" | "burn", tradingPaused: boolean): boolean {
  if (operation === "burn") return true;
  return !tradingPaused;
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
