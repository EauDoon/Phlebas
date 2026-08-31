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
  const vout =
    bytes[32] |
    (bytes[33] << 8) |
    (bytes[34] << 16) |
    (bytes[35] << 24);
  if (vout < 0) throw new RangeError("Outpoint vout overflows signed int32");
  return { txid, vout: vout >>> 0 };
}

export function serializeOutpoint(outpoint: Outpoint): string {
  if (outpoint.vout < 0 || outpoint.vout > 0xffffffff) {
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
