// Zcash transaction outpoint. An outpoint identifies a previous
// transaction output as the input of a new transaction. It is a
// 32-byte little-endian txid followed by a 4-byte little-endian vout.

import { bytesToHex, hexToBytes } from "./bytes-hex.ts";

export type Outpoint = Readonly<{ txid: string; vout: number }>;

function bytesToHexNoPrefix(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

export function parseOutpoint(hex: string): Outpoint {
  const raw = hex.toLowerCase().startsWith("0x") ? hex.slice(2) : hex;
  if (raw.length !== 72) throw new RangeError(`Outpoint hex must be 36 bytes, got ${raw.length / 2}`);
  const bytes = hexToBytes(raw);
  const txid = bytesToHexNoPrefix(bytes.subarray(0, 32).reverse());
  // The index is an unsigned 32-bit integer on the wire. `|` yields a
  // signed int32, so the top half of the range comes back negative and
  // has to be reinterpreted rather than rejected: serializeOutpoint
  // emits every value up to 0xffffffff, and a decoder that cannot read
  // back what the encoder writes turns a legitimate funding outpoint
  // into an unrefundable one. Whether a given index is acceptable for a
  // swap is a policy question for the caller, not an encoding one.
  const vout =
    (bytes[32] |
      (bytes[33] << 8) |
      (bytes[34] << 16) |
      (bytes[35] << 24)) >>> 0;
  return { txid, vout };
}

export function serializeOutpoint(outpoint: Outpoint): string {
  if (!Number.isInteger(outpoint.vout) || outpoint.vout < 0 || outpoint.vout > 0xffffffff) {
    // Number.isInteger is checked first because NaN and a fractional
    // index both survive the range comparisons and then lose their
    // fraction to the byte masks below, silently encoding a different
    // output of the same transaction.
    throw new RangeError(`Outpoint vout must fit uint32, got ${outpoint.vout}`);
  }
  if (outpoint.txid.length !== 64) {
    throw new RangeError(`Outpoint txid must be 32 bytes hex, got ${outpoint.txid.length}`);
  }
  const txidBytes = hexToBytes(outpoint.txid).reverse();
  const voutBytes = new Uint8Array(4);
  voutBytes[0] = outpoint.vout & 0xff;
  voutBytes[1] = (outpoint.vout >> 8) & 0xff;
  voutBytes[2] = (outpoint.vout >> 16) & 0xff;
  voutBytes[3] = (outpoint.vout >> 24) & 0xff;
  return bytesToHex(new Uint8Array([...txidBytes, ...voutBytes]));
}
