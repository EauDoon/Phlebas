import { keccak256Text } from "./keccak.ts";

export type Hex32 = `0x${string}`;
export type HexAddress = `0x${string}`;

export const UINT64_MAX = (1n << 64n) - 1n;
export const UINT256_MAX = (1n << 256n) - 1n;
export const MAX_ORDER_FEE_BPS = 30n;

const CAIP_NAMESPACE = /^[a-z0-9-]{3,8}:[A-Za-z0-9-_]{1,32}$/;
const CAIP_ASSET = /^[a-z0-9-]{3,8}:[A-Za-z0-9-_]{1,32}\/[a-z0-9-]{3,8}:[A-Za-z0-9.%-]{1,128}$/;

export function assertUint(value: bigint, bits: 64 | 256, label: string): void {
  if (typeof value !== "bigint") throw new TypeError(`${label} must be a bigint`);
  const maximum = bits === 64 ? UINT64_MAX : UINT256_MAX;
  if (value < 0n || value > maximum) {
    throw new RangeError(`${label} must fit uint${bits}`);
  }
}

export function normalizeHex32(value: string, label: string): Hex32 {
  if (!/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new TypeError(`${label} must be exactly 32 bytes of hexadecimal`);
  }
  return value.toLowerCase() as Hex32;
}

export function normalizeAddress(value: string, label: string): HexAddress {
  if (!/^0x[0-9a-fA-F]{40}$/.test(value)) {
    throw new TypeError(`${label} must be exactly 20 bytes of hexadecimal`);
  }
  return value.toLowerCase() as HexAddress;
}

export function chainIdentifier(caip2: string): Hex32 {
  if (!CAIP_NAMESPACE.test(caip2)) {
    throw new TypeError("Chain identifier must be a canonical CAIP-2 string");
  }
  return keccak256Text(`phlebas:chain:${caip2}`);
}

export function assetIdentifier(caip19: string): Hex32 {
  if (!CAIP_ASSET.test(caip19)) {
    throw new TypeError("Asset identifier must be a canonical CAIP-19 string");
  }
  return keccak256Text(`phlebas:asset:${caip19}`);
}

export function accountIdentifier(canonicalAccount: string): Hex32 {
  if (canonicalAccount.length === 0 || canonicalAccount.length > 256 || canonicalAccount.trim() !== canonicalAccount) {
    throw new TypeError("Account identifier must be a non-empty canonical string");
  }
  return keccak256Text(`phlebas:account:${canonicalAccount}`);
}

export function adapterIdentifier(name: string): Hex32 {
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/.test(name)) {
    throw new TypeError("Settlement adapter identifier is invalid");
  }
  return keccak256Text(`phlebas:adapter:${name}`);
}
