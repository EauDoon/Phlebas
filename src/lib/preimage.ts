// Preimage primitive for the atomic swap. The preimage is 32 random bytes
// generated in the browser. The hash is SHA-256. The same preimage and the
// same hash are used on both legs. The preimage never leaves the browser
// until the user's wallet signs a ZEC claim. See
// docs/adr/0004-atomic-swap-state-machine.md.

import { hexToBytes } from "./keccak.ts";

const PREIMAGE_BYTES = 32;
const HEX32_LENGTH = 64;

export type Hex32 = `0x${string}`;

export function isValidPreimage(value: string): value is Hex32 {
  return /^0x[0-9a-fA-F]{64}$/.test(value);
}

export function normalizePreimage(value: string): Hex32 {
  if (!isValidPreimage(value)) {
    throw new TypeError("Preimage must be exactly 32 bytes of hexadecimal");
  }
  return value.toLowerCase() as Hex32;
}

function bytesToHex(bytes: Uint8Array): string {
  let out = "0x";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

export function preimageFromBytes(bytes: Uint8Array): Hex32 {
  if (bytes.length !== PREIMAGE_BYTES) {
    throw new RangeError(`Preimage must be exactly ${PREIMAGE_BYTES} bytes`);
  }
  return bytesToHex(bytes) as Hex32;
}

export function preimageFromHex(hex: string): Hex32 {
  const raw = hex.toLowerCase().replace(/^0x/, "");
  if (raw.length !== HEX32_LENGTH) {
    throw new RangeError(`Preimage hex must be ${HEX32_LENGTH} characters`);
  }
  if (!/^[0-9a-f]+$/.test(raw)) {
    throw new TypeError("Preimage hex must contain only 0-9 and a-f");
  }
  return `0x${raw}` as Hex32;
}

export function generatePreimage(random: (length: number) => Uint8Array = defaultRandom): Hex32 {
  const bytes = random(PREIMAGE_BYTES);
  if (bytes.length !== PREIMAGE_BYTES) {
    throw new RangeError("Random source must return exactly 32 bytes");
  }
  return preimageFromBytes(bytes);
}

function defaultRandom(length: number): Uint8Array {
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Browser crypto.getRandomValues is unavailable");
  }
  const buf = new Uint8Array(length);
  globalThis.crypto.getRandomValues(buf);
  return buf;
}

export async function hashPreimage(preimage: Hex32): Promise<Hex32> {
  const raw = preimage.slice(2);
  const bytes = hexToBytes(raw);
  if (globalThis.crypto?.subtle) {
    const source: ArrayBuffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    const digest = await globalThis.crypto.subtle.digest("SHA-256", source);
    return bytesToHex(new Uint8Array(digest)) as Hex32;
  }
  const { createHash } = await import("node:crypto");
  return bytesToHex(createHash("sha256").update(bytes).digest()) as Hex32;
}

export async function verifyPreimage(preimage: Hex32, expectedHash: Hex32): Promise<boolean> {
  const actual = await hashPreimage(preimage);
  return actual.toLowerCase() === expectedHash.toLowerCase();
}
