export type SwapQuote = {
  amountOut: number;
  feePaid: number;
  priceImpactPercent: number;
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
