export type OrderSide = "buy" | "sell";

export type AtomicDecimalRule = Readonly<{
  decimalPlaces: number;
  minimumAtomicUnits: bigint;
}>;

export const QUOTE_PRICE_ATOMIC_RULE = {
  decimalPlaces: 2,
  minimumAtomicUnits: 1n,
} as const satisfies AtomicDecimalRule;

export const ZEC_ATOMIC_RULE = {
  decimalPlaces: 8,
  minimumAtomicUnits: 1n,
} as const satisfies AtomicDecimalRule;

export const QUOTE_TOKEN_ATOMIC_RULE = {
  decimalPlaces: 6,
  minimumAtomicUnits: 1n,
} as const satisfies AtomicDecimalRule;

export const QUOTE_PRICE_TICK = 0.01;
export const ZEC_ATOM = 0.00000001;
export const QUOTE_TOKEN_ATOM = 0.000001;

function atomicScale(decimalPlaces: number): bigint {
  if (!Number.isInteger(decimalPlaces) || decimalPlaces < 0 || decimalPlaces > 18) {
    throw new Error("Atomic decimal precision is outside the preview range");
  }
  return 10n ** BigInt(decimalPlaces);
}

function formatAtomicMinimum(rule: AtomicDecimalRule): string {
  const scale = atomicScale(rule.decimalPlaces);
  const whole = rule.minimumAtomicUnits / scale;
  const fraction = (rule.minimumAtomicUnits % scale).toString().padStart(rule.decimalPlaces, "0");
  return rule.decimalPlaces === 0 ? whole.toString() : `${whole}.${fraction}`;
}

function parseAtomicDecimal(value: string, rule: AtomicDecimalRule, allowZero: boolean): number {
  const [, fraction = ""] = value.split(".");
  if (fraction.length > rule.decimalPlaces) {
    throw new Error(`Value must use no more than ${rule.decimalPlaces} decimal places`);
  }

  const scale = atomicScale(rule.decimalPlaces);
  const [whole] = value.split(".");
  const fractionalUnits = fraction.padEnd(rule.decimalPlaces, "0");
  const atomicUnits = (BigInt(whole) * scale) + BigInt(fractionalUnits || "0");
  if (atomicUnits > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("Value is outside the preview range");
  }
  if (atomicUnits === 0n && allowZero) {
    return 0;
  }
  if (atomicUnits < rule.minimumAtomicUnits) {
    throw new Error(`Value must be at least ${formatAtomicMinimum(rule)}`);
  }
  return Number(atomicUnits) / Number(scale);
}

export function parseStrictDecimal(
  value: string,
  options: {
    allowZero?: boolean;
    maximumExclusive?: number;
    atomicRule?: AtomicDecimalRule;
  } = {},
): number {
  if (value.length > 128) {
    throw new Error("Value is outside the preview range");
  }
  if (!/^\d+(?:\.\d+)?$/.test(value)) {
    throw new Error("Value must use plain decimal notation");
  }

  const parsed = options.atomicRule
    ? parseAtomicDecimal(value, options.atomicRule, options.allowZero ?? false)
    : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Value is outside the preview range");
  }
  if (parsed < 0 || (!options.allowZero && parsed === 0)) {
    throw new Error(options.allowZero ? "Value cannot be negative" : "Value must be positive");
  }
  if (options.maximumExclusive !== undefined && parsed >= options.maximumExclusive) {
    throw new Error(`Value must be below ${options.maximumExclusive}`);
  }
  return parsed;
}

function formatAtomicPreviewAmount(
  value: number,
  rule: AtomicDecimalRule,
  minimumFractionDigits: number,
): string {
  const scale = Number(atomicScale(rule.decimalPlaces));
  const minimum = Number(rule.minimumAtomicUnits) / scale;
  const scaledValue = value * scale;
  if (!Number.isFinite(value) || value < minimum) {
    throw new Error(`Value must be at least ${formatAtomicMinimum(rule)}`);
  }
  if (!Number.isFinite(scaledValue) || scaledValue > Number.MAX_SAFE_INTEGER) {
    throw new Error("Value is outside the preview range");
  }

  const fixed = value.toFixed(rule.decimalPlaces);
  if (Number(fixed) <= 0) {
    throw new Error("Value is outside the preview range");
  }
  const [whole, fraction = ""] = fixed.split(".");
  const trimmedFraction = fraction.replace(/0+$/, "").padEnd(minimumFractionDigits, "0");
  return trimmedFraction.length > 0 ? `${whole}.${trimmedFraction}` : whole;
}

export function formatZecPreviewAmount(value: number): string {
  return formatAtomicPreviewAmount(value, ZEC_ATOMIC_RULE, 0);
}

export function formatQuotePreviewAmount(value: number): string {
  return formatAtomicPreviewAmount(value, QUOTE_TOKEN_ATOMIC_RULE, 2);
}

export function calculatePreviewNotional(price: number, size: number): number {
  if (!Number.isFinite(price) || price <= 0) {
    throw new Error("Price must be positive");
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("Size must be positive");
  }

  const notional = price * size;
  if (!Number.isFinite(notional) || notional <= 0) {
    throw new Error("Notional is outside the preview range");
  }
  if (price < QUOTE_PRICE_TICK) {
    throw new Error(`Price must be at least ${formatAtomicMinimum(QUOTE_PRICE_ATOMIC_RULE)}`);
  }
  if (size < ZEC_ATOM) {
    throw new Error(`Size must be at least ${formatAtomicMinimum(ZEC_ATOMIC_RULE)}`);
  }
  if (notional < QUOTE_TOKEN_ATOM) {
    throw new Error(`Notional must be at least ${formatAtomicMinimum(QUOTE_TOKEN_ATOMIC_RULE)}`);
  }
  if (notional * (10 ** QUOTE_TOKEN_ATOMIC_RULE.decimalPlaces) > Number.MAX_SAFE_INTEGER) {
    throw new Error("Notional is outside the preview range");
  }
  return notional;
}

export function marketOrderConstraintCopy(): string {
  return "Market orders are IOC with a signed worst price. There is no unbounded market instruction. This preview is not live settlement.";
}

export function calculateWorstPrice(
  referencePrice: number,
  side: OrderSide,
  slippagePercent: number,
): number {
  if (!Number.isFinite(referencePrice) || referencePrice < QUOTE_PRICE_TICK) {
    throw new Error(`Reference price must be at least ${formatAtomicMinimum(QUOTE_PRICE_ATOMIC_RULE)}`);
  }
  if (!Number.isFinite(slippagePercent) || slippagePercent < 0 || slippagePercent >= 100) {
    throw new Error("Slippage must be between 0 and 100 percent");
  }

  const multiplier = slippagePercent / 100;
  const worstPrice = side === "buy"
    ? referencePrice * (1 + multiplier)
    : referencePrice * (1 - multiplier);
  if (!Number.isFinite(worstPrice) || worstPrice <= 0) {
    throw new Error("Worst price is outside the preview range");
  }

  const scaledWorstPrice = worstPrice * 100;
  if (
    !Number.isFinite(scaledWorstPrice)
    || scaledWorstPrice <= 0
    || scaledWorstPrice > Number.MAX_SAFE_INTEGER
  ) {
    throw new Error("Worst price is outside the preview range");
  }

  const nearestTick = Math.round(scaledWorstPrice);
  const tolerance = Number.EPSILON * Math.max(1, Math.abs(scaledWorstPrice)) * 4;
  const normalizedScaledPrice = Math.abs(scaledWorstPrice - nearestTick) <= tolerance
    ? nearestTick
    : scaledWorstPrice;
  const roundedWorstPrice = (side === "buy"
    ? Math.ceil(normalizedScaledPrice)
    : Math.floor(normalizedScaledPrice)) / 100;
  if (!Number.isFinite(roundedWorstPrice) || roundedWorstPrice <= 0) {
    throw new Error("Worst price is outside the preview range");
  }
  return roundedWorstPrice;
}
