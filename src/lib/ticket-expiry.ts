export function parseExpiryUnix(value: string): bigint {
  const trimmed = value.trim();
  if (trimmed === "" || trimmed === "0") return 0n;
  if (!/^[0-9]{1,20}$/.test(trimmed)) {
    throw new Error("Expiry must be a whole unix time, or 0 for none.");
  }
  return BigInt(trimmed);
}
