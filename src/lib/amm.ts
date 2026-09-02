export type SwapQuote = {
  amountOut: number;
  feePaid: number;
  priceImpactPercent: number;
};

export type SwapQuoteAtoms = {
  amountOut: bigint;
  feePaid: bigint;
  amountIn: bigint;
};

export function quoteConstantProductSwap(
  amountIn: number,
  reserveIn: number,
  reserveOut: number,
  feeBps = 30,
): SwapQuote {
  if (!Number.isFinite(amountIn) || amountIn <= 0) {
    return { amountOut: 0, feePaid: 0, priceImpactPercent: 0 };
  }
  if (!Number.isFinite(reserveIn) || !Number.isFinite(reserveOut) || reserveIn <= 0 || reserveOut <= 0) {
    throw new Error("Pool reserves must be positive");
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps >= 10_000) {
    throw new Error("Fee must be between 0 and 9,999 basis points");
  }

  const feeMultiplier = (10_000 - feeBps) / 10_000;
  const amountAfterFee = amountIn * feeMultiplier;
  const feePaid = amountIn - amountAfterFee;
  if (!Number.isFinite(amountAfterFee) || amountAfterFee <= 0 || !Number.isFinite(feePaid) || feePaid < 0) {
    throw new Error("Swap amount is outside the preview range");
  }

  const reserveRatio = reserveIn / amountAfterFee;
  const amountOut = reserveOut / (1 + reserveRatio);
  const spotPrice = reserveOut / reserveIn;
  const executionPrice = amountOut / amountAfterFee;
  const priceImpactPercent = Math.max(0, (1 - executionPrice / spotPrice) * 100);
  if (
    !Number.isFinite(reserveRatio) ||
    !Number.isFinite(amountOut) ||
    amountOut <= 0 ||
    amountOut >= reserveOut ||
    !Number.isFinite(spotPrice) ||
    spotPrice <= 0 ||
    !Number.isFinite(executionPrice) ||
    executionPrice <= 0 ||
    !Number.isFinite(priceImpactPercent)
  ) {
    throw new Error("Swap quote is outside the preview range");
  }

  return {
    amountOut,
    feePaid,
    priceImpactPercent,
  };
}

export function quoteConstantProductAmountIn(
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps = 30,
): bigint {
  if (amountOut <= 0n) {
    return 0n;
  }
  if (reserveIn <= 0n || reserveOut <= 0n) {
    throw new Error("Pool reserves must be positive");
  }
  if (amountOut >= reserveOut) {
    throw new Error("Swap quote is outside the preview range");
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps >= 10_000) {
    throw new Error("Fee must be between 0 and 9,999 basis points");
  }

  const numerator = reserveIn * amountOut * 10_000n;
  const denominator = (reserveOut - amountOut) * BigInt(10_000 - feeBps);
  return (numerator / denominator) + 1n;
}

export function quoteConstantProductSwapAtoms(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  feeBps = 30,
): SwapQuoteAtoms {
  if (amountIn <= 0n) {
    return { amountOut: 0n, feePaid: 0n, amountIn };
  }
  if (reserveIn <= 0n || reserveOut <= 0n) {
    throw new Error("Pool reserves must be positive");
  }
  if (!Number.isInteger(feeBps) || feeBps < 0 || feeBps >= 10_000) {
    throw new Error("Fee must be between 0 and 9,999 basis points");
  }

  const feeMultiplier = BigInt(10_000 - feeBps);
  const amountInWithFee = amountIn * feeMultiplier;
  const numerator = amountInWithFee * reserveOut;
  const denominator = (reserveIn * 10_000n) + amountInWithFee;
  const amountOut = numerator / denominator;
  if (amountOut <= 0n || amountOut >= reserveOut) {
    throw new Error("Swap quote is outside the preview range");
  }

  const feePaid = amountIn - ((amountIn * feeMultiplier) / 10_000n);
  return { amountOut, feePaid, amountIn };
}

export function feeAdjustedProductHolds(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint,
  amountOut: bigint,
  feeBps = 30,
): boolean {
  const x = reserveIn + amountIn;
  const y = reserveOut - amountOut;
  const feeAdjusted = (x * 10_000n - amountIn * BigInt(feeBps)) * (y * 10_000n);
  const baseline = reserveIn * reserveOut * 10_000n * 10_000n;
  return feeAdjusted >= baseline;
}

export function balancedQuoteAtoms(
  zecAtoms: bigint,
  reserveZecAtoms: bigint,
  reserveQuoteAtoms: bigint,
): bigint {
  if (zecAtoms <= 0n) {
    return 0n;
  }
  if (reserveZecAtoms <= 0n || reserveQuoteAtoms <= 0n) {
    throw new Error("Pool reserves must be positive");
  }
  // This is the quote-atom side of a proportional LP mint: the depositor must
  // put in at least the pool's current ratio, never less. Floor division here
  // would let a minter round their required quote contribution down while
  // still being credited the full (unrounded-down) share count computed from
  // zecAtoms alone, quietly shorting the pool by up to one atom per mint.
  // That shortfall is real value: it comes straight out of the other LPs'
  // reserveQuoteAtoms claim. Round up so the pool is never shorted.
  const numerator = zecAtoms * reserveQuoteAtoms;
  return (numerator + reserveZecAtoms - 1n) / reserveZecAtoms;
}
