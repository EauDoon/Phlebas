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
  const out = new Uint8Array(raw.length / 2);
  for (let i = 0; i < out.length; i++) {
    const byte = parseInt(raw.substr(i * 2, 2), 16);
    if (Number.isNaN(byte)) throw new RangeError(`Hex string has invalid character at byte ${i}`);
    out[i] = byte;
  }
  return out;
}

export function isHex(value: string, expectedBytes: number): boolean {
  const expectedLen = 2 + expectedBytes * 2;
  if (value.length !== expectedLen) return false;
  if (!value.toLowerCase().startsWith("0x")) return false;
  return /^[0-9a-fA-F]+$/.test(value.slice(2));
}
