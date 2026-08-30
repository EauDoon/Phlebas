export const PRICE_DECIMALS = 2;
export const PZEC_DECIMALS = 8;
export const QUOTE_DECIMALS = 6;

/** sizeAtoms * priceTicks / QUOTE_COST_DIVISOR = quoteAtoms (6 decimals). */
export const QUOTE_COST_DIVISOR = 10_000n;

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

export function quoteAtomsForFill(sizeAtoms: bigint, priceTicks: bigint): bigint {
  if (sizeAtoms < 0n || priceTicks < 0n) {
    throw new RangeError("Fill size and price must be non-negative");
  }
  return (sizeAtoms * priceTicks) / QUOTE_COST_DIVISOR;
}

export function sizeAtomsForQuote(quoteAtoms: bigint, priceTicks: bigint): bigint {
  if (quoteAtoms < 0n || priceTicks <= 0n) {
    throw new RangeError("Quote size requires a positive price");
  }
  return (quoteAtoms * QUOTE_COST_DIVISOR) / priceTicks;
}
