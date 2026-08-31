import { bytesToHex, hexToBytes, keccak256, keccak256Hex } from "./keccak.ts";

export const SETTLEMENT_NAME = "PhlebasSettlement";
export const SETTLEMENT_VERSION = "1";
export const ARBITRUM_SEPOLIA_CHAIN_ID = 421614n;
export const ARBITRUM_ONE_CHAIN_ID = 42161n;

export const SIDE_BUY = 0;
export const SIDE_SELL = 1;
export const VENUE_CLOB = 1;
export const VENUE_AMM = 2;
export const TIF_GTC = 0;
export const TIF_IOC = 1;
export const TIF_FOK = 2;

export type Eip712Domain = {
  name: string;
  version: string;
  chainId: bigint;
  verifyingContract: string;
};

export type TypedOrder = {
  maker: string;
  side: 0 | 1;
  baseAsset: string;
  quoteAsset: string;
  baseAmount: bigint;
  limitPriceTicks: bigint;
  timeInForce: 0 | 1 | 2;
  nonce: bigint;
  accountEpoch: bigint;
  expiry: bigint;
  salt: bigint;
  recipient: string;
  maximumFeeBps: number;
  allowedVenues: number;
};

export const EIP712_DOMAIN_TYPE = "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";
export const ORDER_TYPE = "Order(address maker,uint8 side,address baseAsset,address quoteAsset,uint128 baseAmount,uint128 limitPriceTicks,uint8 timeInForce,uint64 nonce,uint64 accountEpoch,uint64 expiry,uint256 salt,address recipient,uint16 maximumFeeBps,uint8 allowedVenues)";

export const EIP712_DOMAIN_TYPEHASH = keccak256Hex(EIP712_DOMAIN_TYPE);
export const ORDER_TYPEHASH = keccak256Hex(ORDER_TYPE);

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function assertAddress(value: string, label: string): string {
  if (!ADDRESS.test(value)) {
    throw new TypeError(`${label} must be a 20-byte 0x-prefixed address`);
  }
  return value.toLowerCase();
}

function pad32(bytes: Uint8Array): Uint8Array {
  if (bytes.length > 32) {
    throw new RangeError("ABI word exceeds 32 bytes");
  }
  const out = new Uint8Array(32);
  out.set(bytes, 32 - bytes.length);
  return out;
}

export function wordUint(value: bigint): Uint8Array {
  if (value < 0n || value >= 1n << 256n) {
    throw new RangeError("uint256 out of range");
  }
  const hex = value.toString(16).padStart(64, "0");
  return hexToBytes(hex);
}

export function wordUintN(value: bigint, bits: number, label: string): Uint8Array {
  if (value < 0n || value >= 1n << BigInt(bits)) {
    throw new RangeError(`${label} must fit uint${bits}`);
  }
  return wordUint(value);
}

export function wordAddress(value: string): Uint8Array {
  return pad32(hexToBytes(assertAddress(value, "address")));
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

export function hashDomain(domain: Eip712Domain): Uint8Array {
  return keccak256(concat([
    hexToBytes(EIP712_DOMAIN_TYPEHASH),
    keccak256(new TextEncoder().encode(domain.name)),
    keccak256(new TextEncoder().encode(domain.version)),
    wordUint(domain.chainId),
    wordAddress(domain.verifyingContract),
  ]));
}

export function hashOrder(order: TypedOrder): Uint8Array {
  if (order.side !== 0 && order.side !== 1) {
    throw new RangeError("side must be 0 (buy) or 1 (sell)");
  }
  if (order.timeInForce !== TIF_GTC && order.timeInForce !== TIF_IOC && order.timeInForce !== TIF_FOK) {
    throw new RangeError("timeInForce must be GTC, IOC, or FOK");
  }
  if (!Number.isInteger(order.maximumFeeBps) || order.maximumFeeBps < 0 || order.maximumFeeBps > 30) {
    throw new RangeError("maximumFeeBps cannot exceed 30");
  }
  if (!Number.isInteger(order.allowedVenues) || order.allowedVenues < 1 || order.allowedVenues > 3) {
    throw new RangeError("allowedVenues must be a CLOB/AMM bitmask");
  }
  if (order.baseAmount <= 0n || order.limitPriceTicks <= 0n) {
    throw new RangeError("baseAmount and limitPriceTicks must be positive");
  }
  return keccak256(concat([
    hexToBytes(ORDER_TYPEHASH),
    wordAddress(order.maker),
    wordUintN(BigInt(order.side), 8, "side"),
    wordAddress(order.baseAsset),
    wordAddress(order.quoteAsset),
    wordUintN(order.baseAmount, 128, "baseAmount"),
    wordUintN(order.limitPriceTicks, 128, "limitPriceTicks"),
    wordUintN(BigInt(order.timeInForce), 8, "timeInForce"),
    wordUintN(order.nonce, 64, "nonce"),
    wordUintN(order.accountEpoch, 64, "accountEpoch"),
    wordUintN(order.expiry, 64, "expiry"),
    wordUint(order.salt),
    wordAddress(order.recipient),
    wordUintN(BigInt(order.maximumFeeBps), 16, "maximumFeeBps"),
    wordUintN(BigInt(order.allowedVenues), 8, "allowedVenues"),
  ]));
}

export function eip712Digest(domain: Eip712Domain, order: TypedOrder): Uint8Array {
  return keccak256(concat([
    new Uint8Array([0x19, 0x01]),
    hashDomain(domain),
    hashOrder(order),
  ]));
}

export function eip712DigestHex(domain: Eip712Domain, order: TypedOrder): string {
  return bytesToHex(eip712Digest(domain, order));
}

export function sepoliaDomain(verifyingContract: string): Eip712Domain {
  return {
    name: SETTLEMENT_NAME,
    version: SETTLEMENT_VERSION,
    chainId: ARBITRUM_SEPOLIA_CHAIN_ID,
    verifyingContract: assertAddress(verifyingContract, "verifyingContract"),
  };
}

export function typedData(domain: Eip712Domain, order: TypedOrder) {
  hashDomain(domain);
  hashOrder(order);
  return {
    types: {
      EIP712Domain: [
        { name: "name", type: "string" },
        { name: "version", type: "string" },
        { name: "chainId", type: "uint256" },
        { name: "verifyingContract", type: "address" },
      ],
      Order: [
        { name: "maker", type: "address" },
        { name: "side", type: "uint8" },
        { name: "baseAsset", type: "address" },
        { name: "quoteAsset", type: "address" },
        { name: "baseAmount", type: "uint128" },
        { name: "limitPriceTicks", type: "uint128" },
        { name: "timeInForce", type: "uint8" },
        { name: "nonce", type: "uint64" },
        { name: "accountEpoch", type: "uint64" },
        { name: "expiry", type: "uint64" },
        { name: "salt", type: "uint256" },
        { name: "recipient", type: "address" },
        { name: "maximumFeeBps", type: "uint16" },
        { name: "allowedVenues", type: "uint8" },
      ],
    },
    primaryType: "Order",
    domain: {
      name: domain.name,
      version: domain.version,
      chainId: domain.chainId.toString(),
      verifyingContract: assertAddress(domain.verifyingContract, "verifyingContract"),
    },
    message: {
      maker: assertAddress(order.maker, "maker"),
      side: order.side,
      baseAsset: assertAddress(order.baseAsset, "baseAsset"),
      quoteAsset: assertAddress(order.quoteAsset, "quoteAsset"),
      baseAmount: order.baseAmount.toString(),
      limitPriceTicks: order.limitPriceTicks.toString(),
      timeInForce: order.timeInForce,
      nonce: order.nonce.toString(),
      accountEpoch: order.accountEpoch.toString(),
      expiry: order.expiry.toString(),
      salt: order.salt.toString(),
      recipient: assertAddress(order.recipient, "recipient"),
      maximumFeeBps: order.maximumFeeBps,
      allowedVenues: order.allowedVenues,
    },
  } as const;
}

export function venuesBitmask(venues: "clob" | "amm" | "clob,amm"): number {
  if (venues === "clob") return VENUE_CLOB;
  if (venues === "amm") return VENUE_AMM;
  return VENUE_CLOB | VENUE_AMM;
}

export function timeInForceCode(value: "GTC" | "IOC" | "FOK"): 0 | 1 | 2 {
  if (value === "GTC") return TIF_GTC;
  if (value === "IOC") return TIF_IOC;
  if (value === "FOK") return TIF_FOK;
  throw new RangeError("timeInForce must be GTC, IOC, or FOK");
}
