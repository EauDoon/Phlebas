const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
const BECH32M_CONST = 0x2bc830a3;

function polymod(values: number[]): number {
  let chk = 1;
  for (const value of values) {
    const top = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ value;
    for (let i = 0; i < 5; i += 1) {
      if ((top >> i) & 1) chk ^= GEN[i];
    }
  }
  return chk;
}

function hrpExpand(hrp: string): number[] {
  const chars = [...hrp].map((char) => char.charCodeAt(0));
  return [...chars.map((code) => code >> 5), 0, ...chars.map((code) => code & 31)];
}

function createChecksum(hrp: string, data: number[]): number[] {
  const polymodValue = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ BECH32M_CONST;
  return Array.from({ length: 6 }, (_, i) => (polymodValue >> 5 * (5 - i)) & 31);
}

export function convertBits(data: Uint8Array | number[], from: number, to: number, pad: boolean): number[] {
  let acc = 0;
  let bits = 0;
  const max = (1 << to) - 1;
  const out: number[] = [];
  for (const value of data) {
    if (value < 0 || value >> from !== 0) {
      throw new RangeError("bech32 group is out of range");
    }
    acc = (acc << from) | value;
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & max);
    }
  }
  if (pad) {
    if (bits > 0) out.push((acc << (to - bits)) & max);
  } else if (bits >= from || ((acc << (to - bits)) & max) !== 0) {
    throw new RangeError("bech32 padding is invalid");
  }
  return out;
}

/**
 * Maximum encoded length. BIP 173 fixes this at 90 characters and BIP 350
 * carries it forward for bech32m, because the BCH code only guarantees its
 * error-detection properties below that length.
 */
export const BECH32M_MAXIMUM_LENGTH = 90;

/**
 * BIP 173 restricts the human-readable part to US-ASCII 33..126. Anything
 * outside that range is rejected rather than folded into the checksum:
 * hrpExpand splits each code unit into `code >> 5` and `code & 31`, which
 * silently aliases a code point above 126 onto the expansion of some other
 * legal HRP, so an out-of-range HRP can otherwise carry a valid checksum.
 */
function assertHumanReadablePart(hrp: string): void {
  if (hrp.length === 0) {
    throw new TypeError("bech32 HRP must not be empty");
  }
  for (const character of hrp) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 33 || code > 126) {
      throw new TypeError("bech32 HRP character is outside US-ASCII 33..126");
    }
  }
}

export function encodeBech32m(hrp: string, payload: Uint8Array): string {
  if (!/^[a-z0-9]+$/.test(hrp)) {
    throw new TypeError("bech32 HRP must be lowercase alphanumeric");
  }
  const data = convertBits(payload, 8, 5, true);
  const checksum = createChecksum(hrp, data);
  const encoded = `${hrp}1${[...data, ...checksum].map((value) => CHARSET[value]).join("")}`;
  if (encoded.length > BECH32M_MAXIMUM_LENGTH) {
    throw new RangeError("bech32 string exceeds the 90-character maximum");
  }
  return encoded;
}

export function decodeBech32m(address: string): { hrp: string; payload: Uint8Array } {
  if (address !== address.toLowerCase() && address !== address.toUpperCase()) {
    throw new TypeError("bech32 mixed case is invalid");
  }
  if (address.length > BECH32M_MAXIMUM_LENGTH) {
    throw new RangeError("bech32 string exceeds the 90-character maximum");
  }
  const lowered = address.toLowerCase();
  const separator = lowered.lastIndexOf("1");
  if (separator < 1 || separator + 7 > lowered.length) {
    throw new TypeError("bech32 separator is invalid");
  }
  const hrp = lowered.slice(0, separator);
  assertHumanReadablePart(hrp);
  const dataPart = lowered.slice(separator + 1);
  const data: number[] = [];
  for (const char of dataPart) {
    const value = CHARSET.indexOf(char);
    if (value < 0) throw new TypeError("bech32 character is invalid");
    data.push(value);
  }
  if (polymod([...hrpExpand(hrp), ...data]) !== BECH32M_CONST) {
    throw new TypeError("bech32 checksum is invalid");
  }
  const payloadGroups = data.slice(0, -6);
  return { hrp, payload: Uint8Array.from(convertBits(payloadGroups, 5, 8, false)) };
}
