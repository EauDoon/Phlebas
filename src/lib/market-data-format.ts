// Public market data formatters. The formatters convert the
// tick-and-atom representation into human-readable strings for
// the public surface. The formatters are pure functions; the
// formatters never reach out to the network and never sign a
// transaction. The formatters are designed for the JSON
// responses; they are not for the operator console.

const PRICE_SCALE = 4;
const SIZE_SCALE = 8;

export function formatPriceTicks(priceTicks: string | bigint | null, quote: "USDC" | "USDT0" = "USDC"): string {
  if (priceTicks === null) return "—";
  const ticks = typeof priceTicks === "string" ? BigInt(priceTicks) : priceTicks;
  if (ticks < 0n) throw new RangeError("Price ticks must be non-negative");
  const whole = ticks / 10_000n;
  const fraction = ticks % 10_000n;
  const fractionStr = fraction.toString().padStart(PRICE_SCALE, "0");
  return `${whole.toString()}.${fractionStr} ${quote}`;
}

export function formatSizeAtoms(sizeAtoms: string | bigint): string {
  const atoms = typeof sizeAtoms === "string" ? BigInt(sizeAtoms) : sizeAtoms;
  if (atoms < 0n) throw new RangeError("Size atoms must be non-negative");
  const whole = atoms / 100_000_000n;
  const fraction = atoms % 100_000_000n;
  const fractionStr = fraction.toString().padStart(SIZE_SCALE, "0");
  return `${whole.toString()}.${fractionStr} ZEC`;
}

export function formatSignedChangeBps(changeBps: number): string {
  if (!Number.isInteger(changeBps)) throw new RangeError("changeBps must be an integer");
  const sign = changeBps > 0 ? "+" : changeBps < 0 ? "-" : "";
  const absolute = Math.abs(changeBps);
  const whole = Math.trunc(absolute / 100);
  const fraction = String(absolute % 100).padStart(2, "0");
  return `${sign}${whole}.${fraction}%`;
}

export function formatVolumeAtoms(volumeAtoms: string | bigint): string {
  const atoms = typeof volumeAtoms === "string" ? BigInt(volumeAtoms) : volumeAtoms;
  if (atoms < 0n) throw new RangeError("Volume atoms must be non-negative");
  if (atoms >= 1_000_000_000n) {
    return formatScaled(Number(atoms) / 1_000_000_000) + "B";
  }
  if (atoms >= 1_000_000n) {
    return formatScaled(Number(atoms) / 1_000_000) + "M";
  }
  if (atoms >= 1_000n) {
    return formatScaled(Number(atoms) / 1_000) + "K";
  }
  return atoms.toString();
}

function formatScaled(value: number): string {
  if (value >= 100) return value.toFixed(0);
  if (value >= 10) return value.toFixed(1);
  return value.toFixed(1);
}
