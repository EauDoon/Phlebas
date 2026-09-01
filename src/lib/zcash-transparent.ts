import { createHash } from "node:crypto";

import { bytesToHex, hexToBytes } from "./keccak.ts";

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((character, index) => [character, index]));

const PREFIXES = {
  mainnet: {
    p2pkh: Uint8Array.of(0x1c, 0xb8),
    p2sh: Uint8Array.of(0x1c, 0xbd),
  },
  testnet: {
    p2pkh: Uint8Array.of(0x1d, 0x25),
    p2sh: Uint8Array.of(0x1c, 0xba),
  },
} as const;

const TRANSPARENT_HASH_LENGTH = 20;
const TRANSPARENT_RAW_LENGTH = 2 + TRANSPARENT_HASH_LENGTH;
const CHECKSUM_LENGTH = 4;

export type ZcashNetwork = keyof typeof PREFIXES;
export type TransparentAddressType = keyof (typeof PREFIXES)[ZcashNetwork];

export type DecodedTransparentAddress = Readonly<{
  network: ZcashNetwork;
  type: TransparentAddressType;
  hash: Uint8Array;
}>;

function sha256(bytes: Uint8Array): Uint8Array {
  return createHash("sha256").update(bytes).digest();
}

export function hash160(bytes: Uint8Array): Uint8Array {
  return createHash("ripemd160").update(sha256(bytes)).digest();
}

function concatBytes(...parts: Uint8Array[]): Uint8Array {
  const result = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    result.set(part, offset);
    offset += part.length;
  }
  return result;
}

function checksum(bytes: Uint8Array): Uint8Array {
  return sha256(sha256(bytes)).slice(0, CHECKSUM_LENGTH);
}

function encodeBase58(bytes: Uint8Array): string {
  let zeroes = 0;
  while (zeroes < bytes.length && bytes[zeroes] === 0) zeroes += 1;

  let value = 0n;
  for (const byte of bytes) value = (value << 8n) | BigInt(byte);

  let encoded = "";
  while (value > 0n) {
    const index = Number(value % 58n);
    encoded = `${BASE58_ALPHABET[index]}${encoded}`;
    value /= 58n;
  }
  return `${"1".repeat(zeroes)}${encoded}`;
}

function decodeBase58(value: string): Uint8Array {
  if (value.length === 0 || value.length > 64 || value.trim() !== value) {
    throw new TypeError("Base58Check address must be a bounded value without whitespace");
  }

  let decoded = 0n;
  for (const character of value) {
    const index = BASE58_INDEX.get(character);
    if (index === undefined) throw new TypeError("Base58Check address contains an invalid character");
    decoded = (decoded * 58n) + BigInt(index);
  }

  const tail: number[] = [];
  while (decoded > 0n) {
    tail.push(Number(decoded & 0xffn));
    decoded >>= 8n;
  }
  tail.reverse();

  const leadingZeroes = value.length - value.replace(/^1+/, "").length;
  const bytes = Uint8Array.from([...new Array<number>(leadingZeroes).fill(0), ...tail]);
  if (encodeBase58(bytes) !== value) throw new TypeError("Base58Check address is not canonical");
  return bytes;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function addressPrefix(network: ZcashNetwork, type: TransparentAddressType): Uint8Array {
  const networkPrefixes = PREFIXES[network];
  if (!networkPrefixes) throw new TypeError("Unsupported Zcash network");
  const prefix = networkPrefixes[type];
  if (!prefix) throw new TypeError("Unsupported transparent address type");
  return prefix;
}

export function encodeTransparentAddress(
  network: ZcashNetwork,
  type: TransparentAddressType,
  hash: Uint8Array,
): string {
  if (hash.length !== TRANSPARENT_HASH_LENGTH) {
    throw new RangeError("Transparent address hash must be exactly 20 bytes");
  }
  const raw = concatBytes(addressPrefix(network, type), hash);
  return encodeBase58(concatBytes(raw, checksum(raw)));
}

export function decodeTransparentAddress(address: string): DecodedTransparentAddress {
  const decoded = decodeBase58(address);
  if (decoded.length !== TRANSPARENT_RAW_LENGTH + CHECKSUM_LENGTH) {
    throw new RangeError("Transparent address must encode a two-byte prefix and 20-byte hash");
  }
  const raw = decoded.slice(0, TRANSPARENT_RAW_LENGTH);
  if (!sameBytes(decoded.slice(TRANSPARENT_RAW_LENGTH), checksum(raw))) {
    throw new TypeError("Transparent address checksum is invalid");
  }

  const prefix = raw.slice(0, 2);
  for (const network of Object.keys(PREFIXES) as ZcashNetwork[]) {
    for (const type of Object.keys(PREFIXES[network]) as TransparentAddressType[]) {
      if (sameBytes(prefix, PREFIXES[network][type])) {
        return { network, type, hash: raw.slice(2) };
      }
    }
  }
  throw new TypeError("Transparent address prefix is not a supported Zcash network and type");
}

export function p2shScriptPubKey(scriptHash: Uint8Array): Uint8Array {
  if (scriptHash.length !== TRANSPARENT_HASH_LENGTH) {
    throw new RangeError("P2SH script hash must be exactly 20 bytes");
  }
  return Uint8Array.of(0xa9, 0x14, ...scriptHash, 0x87);
}

export function p2pkhScriptPubKey(publicKeyHash: Uint8Array): Uint8Array {
  if (publicKeyHash.length !== TRANSPARENT_HASH_LENGTH) {
    throw new RangeError("P2PKH public key hash must be exactly 20 bytes");
  }
  return Uint8Array.of(0x76, 0xa9, 0x14, ...publicKeyHash, 0x88, 0xac);
}

export function transparentScriptPubKey(address: string, expectedNetwork: ZcashNetwork): Uint8Array {
  const decoded = decodeTransparentAddress(address);
  if (decoded.network !== expectedNetwork) throw new Error("Transparent address is for the wrong Zcash network");
  return decoded.type === "p2sh" ? p2shScriptPubKey(decoded.hash) : p2pkhScriptPubKey(decoded.hash);
}

export function parseP2shScriptPubKey(script: Uint8Array): Uint8Array {
  if (script.length !== 23 || script[0] !== 0xa9 || script[1] !== 0x14 || script[22] !== 0x87) {
    throw new TypeError("Script is not canonical P2SH scriptPubKey");
  }
  return script.slice(2, 22);
}

export function txidHexToPrevoutBytes(txidHex: string): Uint8Array {
  const bytes = hexToBytes(txidHex);
  if (bytes.length !== 32) throw new RangeError("Transaction ID must be exactly 32 bytes");
  return Uint8Array.from(bytes).reverse();
}

export function prevoutBytesToTxidHex(prevoutBytes: Uint8Array): string {
  if (prevoutBytes.length !== 32) throw new RangeError("Serialized prevout transaction ID must be exactly 32 bytes");
  return bytesToHex(Uint8Array.from(prevoutBytes).reverse());
}

export function p2shAddressFromRedeemScript(redeemScript: Uint8Array, network: ZcashNetwork): string {
  return encodeTransparentAddress(network, "p2sh", hash160(redeemScript));
}
