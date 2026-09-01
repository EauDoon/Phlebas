// Compressed secp256k1 public key parser. Zcash uses the same 33-byte
// compressed format as Bitcoin: a 1-byte parity prefix (0x02 or 0x03)
// followed by the 32-byte x coordinate. The parser is the only part of
// the Zcash layer that depends on knowing the secp256k1 curve; signing
// and verification stay behind the wallet adapter.

export type CompressedPubkey = Readonly<{ parity: 0x02 | 0x03; x: Uint8Array }>;

export const COMPRESSED_PUBKEY_LENGTH = 33;
export const UNCOMPRESSED_PUBKEY_LENGTH = 65;

export function parseCompressedPubkey(raw: Uint8Array): CompressedPubkey {
  if (raw.length !== COMPRESSED_PUBKEY_LENGTH) {
    throw new RangeError(
      `Compressed pubkey must be exactly ${COMPRESSED_PUBKEY_LENGTH} bytes, got ${raw.length}`,
    );
  }
  const prefix = raw[0];
  if (prefix !== 0x02 && prefix !== 0x03) {
    throw new RangeError(`Compressed pubkey prefix must be 0x02 or 0x03, got 0x${prefix.toString(16)}`);
  }
  for (let i = 1; i < raw.length; i++) {
    if (raw[i] === 0x00) {
      const leading = i - 1;
      if (leading === 0) {
        throw new RangeError("Compressed pubkey x coordinate has a leading zero in non-prefix byte");
      }
    }
  }
  return { parity: prefix as 0x02 | 0x03, x: raw.subarray(1) };
}

export function encodeCompressedPubkey(pubkey: CompressedPubkey): Uint8Array {
  if (pubkey.x.length !== 32) {
    throw new RangeError(`Compressed pubkey x coordinate must be 32 bytes, got ${pubkey.x.length}`);
  }
  const out = new Uint8Array(COMPRESSED_PUBKEY_LENGTH);
  out[0] = pubkey.parity;
  out.set(pubkey.x, 1);
  return out;
}
