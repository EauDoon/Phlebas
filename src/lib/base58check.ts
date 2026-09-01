// Base58Check encoding and decoding. The Zcash transparent address
// surface and many other surfaces use this. The decoder rejects any
// input whose checksum does not match, so the address layer can fail
// closed on a corrupt or wrong-network string.

import { sha256d } from "./sha256d.ts";

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
const BASE = 58n;
const ALPHABET_MAP: Readonly<Record<string, number>> = (() => {
  const map: Record<string, number> = {};
  for (let i = 0; i < ALPHABET.length; i++) map[ALPHABET[i]] = i;
  return map;
})();

export function base58Encode(bytes: Uint8Array): string {
  if (bytes.length === 0) return "";
  let zeros = 0;
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) zeros += 1;
  let value = 0n;
  for (let i = zeros; i < bytes.length; i++) {
    value = value * 256n + BigInt(bytes[i]);
  }
  let out = "";
  while (value > 0n) {
    const r = Number(value % BASE);
    value = value / BASE;
    out = ALPHABET[r] + out;
  }
  return "1".repeat(zeros) + out;
}

export function base58Decode(value: string): Uint8Array {
  if (value.length === 0) return new Uint8Array(0);
  let zeros = 0;
  for (let i = 0; i < value.length && value[i] === "1"; i++) zeros += 1;
  let acc = 0n;
  for (let i = zeros; i < value.length; i++) {
    const c = value[i];
    const digit = ALPHABET_MAP[c];
    if (digit === undefined) throw new RangeError(`Invalid base58 character: ${c}`);
    acc = acc * BASE + BigInt(digit);
  }
  const out: number[] = [];
  while (acc > 0n) {
    out.unshift(Number(acc & 0xffn));
    acc >>= 8n;
  }
  return new Uint8Array([...new Array(zeros).fill(0), ...out]);
}

export function base58checkEncode(payload: Uint8Array): string {
  if (payload.length < 1) throw new RangeError("base58check payload must be non-empty");
  const checksum = sha256d(payload).subarray(0, 4);
  const full = new Uint8Array(payload.length + 4);
  full.set(payload);
  full.set(checksum, payload.length);
  return base58Encode(full);
}

export function base58checkDecode(value: string): Uint8Array {
  const decoded = base58Decode(value);
  if (decoded.length < 5) throw new RangeError("base58check input too short");
  const payload = decoded.subarray(0, decoded.length - 4);
  const expected = sha256d(payload).subarray(0, 4);
  const got = decoded.subarray(decoded.length - 4);
  for (let i = 0; i < 4; i++) {
    if (expected[i] !== got[i]) throw new RangeError("base58check checksum mismatch");
  }
  return payload;
}
