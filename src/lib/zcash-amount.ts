// ZEC amount utilities. One ZEC is 100,000,000 zatoshis (1e8). All
// amounts in the Zcash layer are stored and compared as zatoshis
// (bigint). This module is the only place the conversion happens.

export const ZATOSHIS_PER_ZEC = 100_000_000n;

export function zecToZatoshis(zec: number | bigint): bigint {
  const value = typeof zec === "bigint" ? zec : BigInt(zec);
  if (value < 0n) throw new RangeError(`ZEC value must be non-negative, got ${value}`);
  return value * ZATOSHIS_PER_ZEC;
}

export function zatoshisToZec(zatoshis: bigint): bigint {
  if (zatoshis < 0n) throw new RangeError(`Zatoshi value must be non-negative, got ${zatoshis}`);
  return zatoshis / ZATOSHIS_PER_ZEC;
}

export function isDustThreshold(zatoshis: bigint): boolean {
  // Zcash standard dust threshold is 0.00001 ZEC = 1_000 zatoshis.
  return zatoshis > 0n && zatoshis < 1_000n;
}
