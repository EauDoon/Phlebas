export const PRICE_DECIMALS = 2;
export const ZEC_DECIMALS = 8;
export const QUOTE_DECIMALS = 6;

/** sizeAtoms * priceTicks / QUOTE_COST_DIVISOR = quoteAtoms (6 decimals). */
export const QUOTE_COST_DIVISOR = 10_000n;

export type QuoteRounding = "down" | "up";

export function formatAtomicUnits(
  units: bigint,
  decimals: number,
  minFractionDigits = 0,
): string {
  if (units < 0n) {
    throw new RangeError("Value cannot be negative");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new RangeError("Atomic decimal precision is outside the preview range");
  }
  if (
    !Number.isInteger(minFractionDigits)
    || minFractionDigits < 0
    || minFractionDigits > decimals
  ) {
    throw new RangeError("Atomic decimal precision is outside the preview range");
  }

  const scale = 10n ** BigInt(decimals);
  const whole = units / scale;
  const fraction = (units % scale).toString().padStart(decimals, "0");
  const trimmed = fraction.replace(/0+$/, "").padEnd(minFractionDigits, "0");
  return trimmed.length > 0 ? `${whole}.${trimmed}` : whole.toString();
}

export function parseAtomicUnits(
  value: string,
  decimals: number,
  options: { allowZero?: boolean; minimum?: bigint } = {},
): bigint {
  if (value.length > 128) {
    throw new Error("Value is outside the preview range");
  }
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new Error("Value must use plain decimal notation");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 18) {
    throw new RangeError("Atomic decimal precision is outside the preview range");
  }

  const [, fraction = ""] = value.split(".");
  if (fraction.length > decimals) {
    throw new Error(`Value must use no more than ${decimals} decimal places`);
  }

  const scale = 10n ** BigInt(decimals);
  const [whole] = value.split(".");
  const units = (BigInt(whole) * scale) + BigInt(fraction.padEnd(decimals, "0") || "0");
  if (units === 0n && (options.allowZero ?? false)) {
    return 0n;
  }

  const minimum = options.minimum ?? 1n;
  if (units < minimum) {
    throw new Error(`Value must be at least ${formatAtomicUnits(minimum, decimals)}`);
  }
  return units;
}

function divideQuoteNumerator(numerator: bigint, rounding: QuoteRounding): bigint {
  if (numerator < 0n) {
    throw new RangeError("Quote numerator must be non-negative");
  }
  if (rounding === "up" && numerator > 0n) {
    return ((numerator - 1n) / QUOTE_COST_DIVISOR) + 1n;
  }
  return numerator / QUOTE_COST_DIVISOR;
}

export function quoteAtomsForFill(
  sizeAtoms: bigint,
  priceTicks: bigint,
  rounding: QuoteRounding,
): bigint {
  if (sizeAtoms < 0n || priceTicks < 0n) {
    throw new RangeError("Fill size and price must be non-negative");
  }
  return divideQuoteNumerator(sizeAtoms * priceTicks, rounding);
}

export function quoteAtomsForFills(
  fills: readonly { sizeAtoms: bigint; priceTicks: bigint }[],
  rounding: QuoteRounding,
): bigint {
  let numerator = 0n;
  for (const fill of fills) {
    if (fill.sizeAtoms < 0n || fill.priceTicks < 0n) {
      throw new RangeError("Fill size and price must be non-negative");
    }
    numerator += fill.sizeAtoms * fill.priceTicks;
  }
  return divideQuoteNumerator(numerator, rounding);
}

export function meetsMinimumQuoteSettlement(sizeAtoms: bigint, priceTicks: bigint): boolean {
  return sizeAtoms > 0n
    && priceTicks > 0n
    && sizeAtoms * priceTicks >= QUOTE_COST_DIVISOR;
}

export function minimumSizeAtomsForQuoteSettlement(priceTicks: bigint): bigint {
  if (priceTicks <= 0n) {
    throw new RangeError("Minimum settlement requires a positive price");
  }
  return ((QUOTE_COST_DIVISOR - 1n) / priceTicks) + 1n;
}

export function sizeAtomsForQuote(quoteAtoms: bigint, priceTicks: bigint): bigint {
  if (quoteAtoms < 0n || priceTicks <= 0n) {
    throw new RangeError("Quote size requires a positive price");
  }
  return (quoteAtoms * QUOTE_COST_DIVISOR) / priceTicks;
}

export function worstPriceTicks(
  lastTicks: bigint,
  side: "buy" | "sell",
  slippageHundredths: bigint,
): bigint {
  if (lastTicks <= 0n) {
    throw new RangeError("Reference price must be positive");
  }
  if (slippageHundredths < 0n || slippageHundredths >= 10_000n) {
    throw new RangeError("Slippage must be between 0 and 100 percent");
  }

  if (side === "buy") {
    return ((lastTicks * (10_000n + slippageHundredths)) + 9_999n) / 10_000n;
  }

  const ticks = (lastTicks * (10_000n - slippageHundredths)) / 10_000n;
  if (ticks <= 0n) {
    throw new RangeError("Worst price is outside the preview range");
  }
  return ticks;
}
