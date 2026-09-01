// Browser-safe Zcash transparent-address primitives.
//
// This module is imported by both the browser order client and the matcher.
// Keep it synchronous and free of Node-only imports. Transparent Zcash
// addresses are two-byte-version Base58Check values containing a 20-byte
// HASH160 payload.

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE58_INDEX = new Map([...BASE58_ALPHABET].map((character, index) => [character, index]));

const SHA256_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

const RIPEMD160_LEFT_INDEX = [
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
  7, 4, 13, 1, 10, 6, 15, 3, 12, 0, 9, 5, 2, 14, 11, 8,
  3, 10, 14, 4, 9, 15, 8, 1, 2, 7, 0, 6, 13, 11, 5, 12,
  1, 9, 11, 10, 0, 8, 12, 4, 13, 3, 7, 15, 14, 5, 6, 2,
  4, 0, 5, 9, 7, 12, 2, 10, 14, 1, 3, 8, 11, 6, 15, 13,
] as const;

const RIPEMD160_RIGHT_INDEX = [
  5, 14, 7, 0, 9, 2, 11, 4, 13, 6, 15, 8, 1, 10, 3, 12,
  6, 11, 3, 7, 0, 13, 5, 10, 14, 15, 8, 12, 4, 9, 1, 2,
  15, 5, 1, 3, 7, 14, 6, 9, 11, 8, 12, 2, 10, 0, 4, 13,
  8, 6, 4, 1, 3, 11, 15, 0, 5, 12, 2, 13, 9, 7, 10, 14,
  12, 15, 10, 4, 1, 5, 8, 7, 6, 2, 13, 14, 0, 3, 9, 11,
] as const;

const RIPEMD160_LEFT_ROTATION = [
  11, 14, 15, 12, 5, 8, 7, 9, 11, 13, 14, 15, 6, 7, 9, 8,
  7, 6, 8, 13, 11, 9, 7, 15, 7, 12, 15, 9, 11, 7, 13, 12,
  11, 13, 6, 7, 14, 9, 13, 15, 14, 8, 13, 6, 5, 12, 7, 5,
  11, 12, 14, 15, 14, 15, 9, 8, 9, 14, 5, 6, 8, 6, 5, 12,
  9, 15, 5, 11, 6, 8, 13, 12, 5, 12, 13, 14, 11, 8, 5, 6,
] as const;

const RIPEMD160_RIGHT_ROTATION = [
  8, 9, 9, 11, 13, 15, 15, 5, 7, 7, 8, 11, 14, 14, 12, 6,
  9, 13, 15, 7, 12, 8, 9, 11, 7, 7, 12, 7, 6, 15, 13, 11,
  9, 7, 15, 11, 8, 6, 6, 14, 12, 13, 5, 14, 13, 13, 7, 5,
  15, 5, 8, 11, 14, 14, 6, 14, 6, 9, 12, 9, 12, 5, 15, 8,
  8, 5, 12, 9, 12, 5, 14, 6, 8, 13, 6, 5, 15, 13, 11, 11,
] as const;

const RIPEMD160_LEFT_CONSTANT = [0x00000000, 0x5a827999, 0x6ed9eba1, 0x8f1bbcdc, 0xa953fd4e] as const;
const RIPEMD160_RIGHT_CONSTANT = [0x50a28be6, 0x5c4dd124, 0x6d703ef3, 0x7a6d76e9, 0x00000000] as const;

export type DestinationInspection = {
  class: "empty" | "placeholder" | "shielded" | "tex" | "transparent-shape" | "unrecognized";
  eligibleLater: boolean;
  message: string;
};

const TRANSPARENT_SHAPE = /^t[13][1-9A-HJ-NP-Za-km-z]{25,50}$/;

export function inspectTransparentDestination(value: string): DestinationInspection {
  const destination = value.trim();
  if (destination.length === 0) {
    return {
      class: "empty",
      eligibleLater: false,
      message: "Enter a destination to inspect. This simulation never sends ZEC.",
    };
  }
  if (destination.includes("{TEX_ADDRESS}") || destination.startsWith("zcash:")) {
    return {
      class: "placeholder",
      eligibleLater: false,
      message: "Payment-request templates are not payout destinations.",
    };
  }
  if (/^tex1[0-9a-z]+$/i.test(destination)) {
    return {
      class: "tex",
      eligibleLater: false,
      message: "TEX is for deposits. This interface does not accept TEX payouts.",
    };
  }
  if (/^[zu][a-z0-9]/i.test(destination)) {
    return {
      class: "shielded",
      eligibleLater: false,
      message: "Shielded and unified addresses are out of scope. Withdrawals accept only a network-correct transparent destination under the proposed policy.",
    };
  }
  if (TRANSPARENT_SHAPE.test(destination)) {
    return {
      class: "transparent-shape",
      eligibleLater: false,
      message: "Transparent-shape input noted. No wallet is Phlebas-verified, and this simulation does not send ZEC.",
    };
  }
  return {
    class: "unrecognized",
    eligibleLater: false,
    message: "Unrecognized destination. A later testnet would accept only a network-correct transparent address.",
  };
}

export type ZcashNetwork = "testnet" | "mainnet";
export type TransparentAddressKind = "p2pkh" | "p2sh";

export const VERSION_BYTES: Readonly<Record<`${ZcashNetwork}_${TransparentAddressKind}`, number>> = {
  testnet_p2pkh: 0x1d25,
  testnet_p2sh: 0x1cba,
  mainnet_p2pkh: 0x1cb8,
  mainnet_p2sh: 0x1cbd,
};

const TRANSPARENT_PAYLOAD_LENGTH = 22;
const TRANSPARENT_HASH_LENGTH = 20;
const CHECKSUM_LENGTH = 4;
const TRANSPARENT_DECODED_LENGTH = TRANSPARENT_PAYLOAD_LENGTH + CHECKSUM_LENGTH;

export type DecodedZcashAddress = Readonly<{
  network: ZcashNetwork;
  kind: TransparentAddressKind;
  payload: Uint8Array;
}>;

export type DecodedZcashAccount = Readonly<{
  environment: ZcashNetwork;
  address: string;
  network: ZcashNetwork;
  kind: TransparentAddressKind;
  payload: Uint8Array;
}>;

function rightRotate(value: number, shift: number): number {
  return (value >>> shift) | (value << (32 - shift));
}

function leftRotate(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function sha256(message: Uint8Array): Uint8Array {
  const initial = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ];
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;
  const bitLength = BigInt(message.length) * 8n;
  for (let index = 0; index < 8; index += 1) {
    padded[padded.length - 1 - index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
  }

  const state = [...initial];
  const schedule = new Uint32Array(64);
  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const start = offset + (index * 4);
      schedule[index] = (
        (padded[start] << 24)
        | (padded[start + 1] << 16)
        | (padded[start + 2] << 8)
        | padded[start + 3]
      ) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const lower = schedule[index - 15];
      const upper = schedule[index - 2];
      const sigma0 = rightRotate(lower, 7) ^ rightRotate(lower, 18) ^ (lower >>> 3);
      const sigma1 = rightRotate(upper, 17) ^ rightRotate(upper, 19) ^ (upper >>> 10);
      schedule[index] = (schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = state;
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choose = (e & f) ^ ((~e) & g);
      const first = (h + sum1 + choose + SHA256_CONSTANTS[index] + schedule[index]) >>> 0;
      const sum0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (sum0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }
    state[0] = (state[0] + a) >>> 0;
    state[1] = (state[1] + b) >>> 0;
    state[2] = (state[2] + c) >>> 0;
    state[3] = (state[3] + d) >>> 0;
    state[4] = (state[4] + e) >>> 0;
    state[5] = (state[5] + f) >>> 0;
    state[6] = (state[6] + g) >>> 0;
    state[7] = (state[7] + h) >>> 0;
  }

  const digest = new Uint8Array(32);
  for (let index = 0; index < state.length; index += 1) {
    const word = state[index];
    digest[index * 4] = word >>> 24;
    digest[(index * 4) + 1] = word >>> 16;
    digest[(index * 4) + 2] = word >>> 8;
    digest[(index * 4) + 3] = word;
  }
  return digest;
}

function ripemd160Function(round: number, x: number, y: number, z: number): number {
  if (round < 16) return x ^ y ^ z;
  if (round < 32) return (x & y) | (~x & z);
  if (round < 48) return (x | ~y) ^ z;
  if (round < 64) return (x & z) | (y & ~z);
  return x ^ (y | ~z);
}

function ripemd160(message: Uint8Array): Uint8Array {
  const paddedLength = Math.ceil((message.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(message);
  padded[message.length] = 0x80;
  const bitLength = BigInt(message.length) * 8n;
  for (let index = 0; index < 8; index += 1) {
    padded[padded.length - 8 + index] = Number((bitLength >> BigInt(index * 8)) & 0xffn);
  }

  let h0 = 0x67452301;
  let h1 = 0xefcdab89;
  let h2 = 0x98badcfe;
  let h3 = 0x10325476;
  let h4 = 0xc3d2e1f0;
  const words = new Uint32Array(16);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const start = offset + (index * 4);
      words[index] = (
        padded[start]
        | (padded[start + 1] << 8)
        | (padded[start + 2] << 16)
        | (padded[start + 3] << 24)
      ) >>> 0;
    }

    let a = h0;
    let b = h1;
    let c = h2;
    let d = h3;
    let e = h4;
    let aa = h0;
    let bb = h1;
    let cc = h2;
    let dd = h3;
    let ee = h4;

    for (let round = 0; round < 80; round += 1) {
      const left = (
        leftRotate(
          (a + ripemd160Function(round, b, c, d) + words[RIPEMD160_LEFT_INDEX[round]]
            + RIPEMD160_LEFT_CONSTANT[Math.floor(round / 16)]) >>> 0,
          RIPEMD160_LEFT_ROTATION[round],
        )
        + e
      ) >>> 0;
      a = e;
      e = d;
      d = leftRotate(c, 10);
      c = b;
      b = left;

      const right = (
        leftRotate(
          (aa + ripemd160Function(79 - round, bb, cc, dd) + words[RIPEMD160_RIGHT_INDEX[round]]
            + RIPEMD160_RIGHT_CONSTANT[Math.floor(round / 16)]) >>> 0,
          RIPEMD160_RIGHT_ROTATION[round],
        )
        + ee
      ) >>> 0;
      aa = ee;
      ee = dd;
      dd = leftRotate(cc, 10);
      cc = bb;
      bb = right;
    }

    const temporary = (h1 + c + dd) >>> 0;
    h1 = (h2 + d + ee) >>> 0;
    h2 = (h3 + e + aa) >>> 0;
    h3 = (h4 + a + bb) >>> 0;
    h4 = (h0 + b + cc) >>> 0;
    h0 = temporary;
  }

  const digest = new Uint8Array(20);
  const state = [h0, h1, h2, h3, h4];
  for (let index = 0; index < state.length; index += 1) {
    const word = state[index];
    digest[index * 4] = word;
    digest[(index * 4) + 1] = word >>> 8;
    digest[(index * 4) + 2] = word >>> 16;
    digest[(index * 4) + 3] = word >>> 24;
  }
  return digest;
}

function checksum(payload: Uint8Array): Uint8Array {
  return sha256(sha256(payload)).slice(0, CHECKSUM_LENGTH);
}

function encodeBase58(bytes: Uint8Array): string {
  let leadingZeroes = 0;
  while (leadingZeroes < bytes.length && bytes[leadingZeroes] === 0) leadingZeroes += 1;

  let value = 0n;
  for (const byte of bytes) value = (value * 256n) + BigInt(byte);

  let encoded = "";
  while (value > 0n) {
    const index = Number(value % 58n);
    encoded = `${BASE58_ALPHABET[index]}${encoded}`;
    value /= 58n;
  }
  return `${"1".repeat(leadingZeroes)}${encoded}`;
}

function decodeBase58(value: string): Uint8Array {
  if (typeof value !== "string") throw new TypeError("Zcash address must be a string");
  if (value.length === 0 || value.length > 64 || /\s/.test(value)) {
    throw new TypeError("Zcash address must be a bounded value without whitespace");
  }

  let decoded = 0n;
  for (const character of value) {
    const index = BASE58_INDEX.get(character);
    if (index === undefined) throw new TypeError(`Invalid base58 character: ${character}`);
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
  if (encodeBase58(bytes) !== value) throw new TypeError("Zcash address is not canonical Base58");
  return bytes;
}

function versionFor(network: ZcashNetwork, kind: TransparentAddressKind): number {
  const version = VERSION_BYTES[`${network}_${kind}`];
  if (version === undefined) throw new TypeError("Unsupported Zcash network or transparent address type");
  return version;
}

function encodeWithVersion(version: number, payload: Uint8Array): string {
  const raw = new Uint8Array(2 + payload.length);
  raw[0] = (version >>> 8) & 0xff;
  raw[1] = version & 0xff;
  raw.set(payload, 2);
  const full = new Uint8Array(raw.length + CHECKSUM_LENGTH);
  full.set(raw);
  full.set(checksum(raw), raw.length);
  return encodeBase58(full);
}

export function p2pkhAddress(pubkeyHash20: Uint8Array, network: ZcashNetwork = "testnet"): string {
  if (pubkeyHash20.length !== TRANSPARENT_HASH_LENGTH) {
    throw new RangeError(`P2PKH payload must be 20 bytes, got ${pubkeyHash20.length}`);
  }
  return encodeWithVersion(versionFor(network, "p2pkh"), pubkeyHash20);
}

export function p2shAddress(scriptHash20: Uint8Array, network: ZcashNetwork = "testnet"): string {
  if (scriptHash20.length !== TRANSPARENT_HASH_LENGTH) {
    throw new RangeError(`P2SH payload must be 20 bytes, got ${scriptHash20.length}`);
  }
  return encodeWithVersion(versionFor(network, "p2sh"), scriptHash20);
}

export function hash160Value(message: Uint8Array): Uint8Array {
  return ripemd160(sha256(message));
}

export function pubkeyHash160(compressedPubkey: Uint8Array): Uint8Array {
  if (compressedPubkey.length !== 33) {
    throw new RangeError("Compressed pubkey must be 33 bytes");
  }
  return hash160Value(compressedPubkey);
}

export function decodeAddress(value: string): DecodedZcashAddress {
  const decoded = decodeBase58(value);
  if (decoded.length !== TRANSPARENT_DECODED_LENGTH) {
    throw new RangeError("Zcash address payload must be 22 bytes after Base58Check");
  }

  const payload = decoded.slice(0, TRANSPARENT_PAYLOAD_LENGTH);
  const expectedChecksum = checksum(payload);
  const actualChecksum = decoded.subarray(TRANSPARENT_PAYLOAD_LENGTH);
  let checksumMatches = true;
  for (let index = 0; index < CHECKSUM_LENGTH; index += 1) {
    checksumMatches = checksumMatches && expectedChecksum[index] === actualChecksum[index];
  }
  if (!checksumMatches) throw new RangeError("base58check checksum mismatch");

  const version = (payload[0] << 8) | payload[1];
  for (const [key, expectedVersion] of Object.entries(VERSION_BYTES)) {
    if (expectedVersion !== version) continue;
    const [network, kind] = key.split("_") as [ZcashNetwork, TransparentAddressKind];
    return { network, kind, payload: payload.slice(2) };
  }
  throw new RangeError(`Unknown Zcash address version: 0x${version.toString(16)}`);
}

export function validateZcashTransparentAddress(
  address: string,
  expectedNetwork?: ZcashNetwork,
): DecodedZcashAddress {
  const decoded = decodeAddress(address);
  if (expectedNetwork !== undefined && decoded.network !== expectedNetwork) {
    throw new RangeError(`Zcash address is for the wrong ${expectedNetwork} network`);
  }
  return decoded;
}

function isZcashNetwork(value: string): value is ZcashNetwork {
  return value === "testnet" || value === "mainnet";
}

export function decodeZcashTransparentAccount(value: string): DecodedZcashAccount {
  if (typeof value !== "string") throw new TypeError("Zcash account must be a string");
  if (value.length === 0 || /\s/.test(value)) {
    throw new TypeError("Zcash account must be canonical and contain no whitespace");
  }
  const fields = value.split(":");
  if (fields.length !== 3 || fields[0] !== "zcash" || !isZcashNetwork(fields[1]) || fields[2].length === 0) {
    throw new TypeError("Zcash account must be canonical zcash:<environment>:<address>");
  }

  const environment = fields[1];
  const address = fields[2];
  const decoded = decodeAddress(address);
  if (decoded.network !== environment) {
    throw new RangeError(`Zcash account address is for the wrong ${environment} network`);
  }
  return { environment, address, network: decoded.network, kind: decoded.kind, payload: decoded.payload };
}

export const parseZcashTransparentAccount = decodeZcashTransparentAccount;

export function canonicalZcashTransparentAccount(environment: ZcashNetwork, address: string): string {
  const decoded = decodeAddress(address);
  if (decoded.network !== environment) {
    throw new RangeError(`Zcash address is for the wrong ${environment} network`);
  }
  return `zcash:${environment}:${address}`;
}

export const canonicalZcashAccount = canonicalZcashTransparentAccount;

export function assertZcashTransparentAccount(
  account: string,
  environment: ZcashNetwork,
  label = "Zcash account",
): void {
  try {
    const decoded = decodeZcashTransparentAccount(account);
    if (decoded.environment !== environment) throw new RangeError("wrong network");
  } catch (error) {
    const reason = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`${label} must be a transparent ${environment} Zcash account${reason}`);
  }
}

export function assertZcashTransparentP2pkhAccount(
  account: string,
  environment: ZcashNetwork,
  label = "Zcash account",
): void {
  try {
    const decoded = decodeZcashTransparentAccount(account);
    if (decoded.environment !== environment) throw new RangeError("wrong network");
    if (decoded.kind !== "p2pkh") throw new TypeError("address is not P2PKH");
  } catch (error) {
    const reason = error instanceof Error ? `: ${error.message}` : "";
    throw new Error(`${label} must be a transparent P2PKH ${environment} Zcash account${reason}`);
  }
}

export function isZcashTransparentAccount(value: string, environment?: ZcashNetwork): boolean {
  try {
    const decoded = decodeZcashTransparentAccount(value);
    return environment === undefined || decoded.environment === environment;
  } catch {
    return false;
  }
}
