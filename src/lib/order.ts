import {
  QUOTE_DECIMALS,
  formatAtomicUnits,
  meetsMinimumQuoteSettlement,
  quoteAtomsForFill,
} from "./units.ts";
export type OrderSide = "buy" | "sell";

/**
 * The quote amount a ticket would actually settle for, in quote atoms.
 *
 * This is the same integer arithmetic the engine uses, on the same side:
 * a buy is charged the rounded-up quote amount and a sell receives the
 * rounded-down one. A side-blind float product cannot tell those apart:
 * at price 777.77 and size 77.77777777 it is 60493.2222166... exactly,
 * and the ticket must show the buy the 60493.222217 it pays, not the
 * sell's 60493.222216. One atom is a millionth of a dollar, but a venue
 * that displays a total should display the total, and the two rounding
 * directions are exactly what quoteAtomsForFill exists to keep straight.
 *
 * The admission gate is the engine's own meetsMinimumQuoteSettlement
 * rather than a float threshold that happens to coincide with it, so the
 * ticket cannot start disagreeing with the book about which orders are
 * settleable if either side's constants move.
 */
export function previewQuoteAtoms(priceTicks: bigint, sizeAtoms: bigint, side: OrderSide): bigint {
  if (priceTicks <= 0n) {
    throw new Error(`Price must be at least ${formatAtomicMinimum(QUOTE_PRICE_ATOMIC_RULE)}`);
  }
  if (sizeAtoms <= 0n) {
    throw new Error(`Size must be at least ${formatAtomicMinimum(ZEC_ATOMIC_RULE)}`);
  }
  if (!meetsMinimumQuoteSettlement(sizeAtoms, priceTicks)) {
    throw new Error("Order notional must settle to at least one quote atom");
  }
  return quoteAtomsForFill(sizeAtoms, priceTicks, side === "buy" ? "up" : "down");
}

/** Render a quote-atom amount the way the ticket shows it. */
export function formatQuoteAtoms(quoteAtoms: bigint): string {
  return formatAtomicUnits(quoteAtoms, QUOTE_DECIMALS, 2);
}

export function sideControlCopy(side: OrderSide, selected: boolean): string {
  const label = side === "buy" ? "Buy" : "Sell";
  return selected ? `${label} selected` : label;
}

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

export function marketOrderConstraintCopy(): string {
  return "Market orders are IOC with a signed worst price. There is no unbounded market instruction. This preview is not live settlement.";
}
