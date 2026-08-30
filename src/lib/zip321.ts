const ZATOSHIS_PER_ZEC = 100_000_000n;
const MAX_ZATOSHIS = 2_100_000_000_000_000n;

export const SYNTHETIC_TEX_PLACEHOLDER = "{TEX_ADDRESS}";
export const SYNTHETIC_DEPOSIT_ZATOSHIS = 100_000_000n;

export function formatZip321Amount(zatoshis: bigint): string {
  if (zatoshis <= 0n || zatoshis > MAX_ZATOSHIS) {
    throw new RangeError("ZIP 321 amount must be from 1 zatoshi through 21,000,000 ZEC");
  }

  const whole = zatoshis / ZATOSHIS_PER_ZEC;
  const fraction = zatoshis % ZATOSHIS_PER_ZEC;
  if (fraction === 0n) {
    return whole.toString();
  }

  return `${whole}.${fraction.toString().padStart(8, "0").replace(/0+$/, "")}`;
}

export function buildZip321Uri(options: {
  address: string;
  amountZatoshis?: bigint;
  label?: string;
}): string {
  const address = options.address.trim();
  if (address.length === 0 || address.includes("?") || address.includes("#") || /\s/.test(address)) {
    throw new TypeError("ZIP 321 address must be a single path value");
  }

  const parameters: string[] = [];
  if (options.amountZatoshis !== undefined) {
    parameters.push(`amount=${formatZip321Amount(options.amountZatoshis)}`);
  }
  parameters.push(`label=${encodeURIComponent(options.label ?? "Phlebas")}`);
  return `zcash:${address}?${parameters.join("&")}`;
}

export function syntheticDepositRequest(): string {
  return buildZip321Uri({
    address: SYNTHETIC_TEX_PLACEHOLDER,
    amountZatoshis: SYNTHETIC_DEPOSIT_ZATOSHIS,
  });
}
