// Hex string utilities. The Zcash address encoder and the wallet adapter
// both need to convert between 0x-prefixed hex strings and Uint8Array.
// Extracted from zcash-address so each side stays testable in
// isolation.

export function bytesToHex(bytes: Uint8Array): `0x${string}` {
  let out = "0x";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out as `0x${string}`;
}

export function hexToBytes(hex: string): Uint8Array {
  if (hex.length % 2 !== 0) throw new RangeError(`Hex string must have even length, got ${hex.length}`);
  const raw = hex.toLowerCase().startsWith("0x") ? hex.slice(2) : hex;
  // The whole string is checked before any pair is converted. parseInt
  // stops at the first character it cannot read instead of failing, so it
  // reports a value for "1z" (1), " 1" (1) and "-1" (-1), and a negative
  // value wraps to 0xff on the way into a Uint8Array. A per-pair NaN
  // check only catches a bad *first* nibble, which leaves a malformed
  // string decoding to a clean, wrong byte string.
  if (!/^[0-9a-fA-F]*$/.test(raw)) {
    throw new RangeError("Hex string has an invalid character");
  }
  const out = new Uint8Array(raw.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function isHex(value: string, expectedBytes: number): boolean {
  const expectedLen = 2 + expectedBytes * 2;
  if (value.length !== expectedLen) return false;
  if (!value.toLowerCase().startsWith("0x")) return false;
  return /^[0-9a-fA-F]+$/.test(value.slice(2));
}
