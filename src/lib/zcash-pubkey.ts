// Compressed secp256k1 public key parser. Zcash uses the same 33-byte
// compressed format as Bitcoin: a 1-byte parity prefix (0x02 or 0x03)
// followed by the 32-byte x coordinate. The parser is the only part of
// the Zcash layer that depends on knowing the secp256k1 curve; signing
// and verification stay behind the wallet adapter.

export type CompressedPubkey = Readonly<{ parity: 0x02 | 0x03; x: Uint8Array }>;

export const COMPRESSED_PUBKEY_LENGTH = 33;
export const UNCOMPRESSED_PUBKEY_LENGTH = 65;

/** p = 2^256 - 2^32 - 977, the secp256k1 base field order. */
const SECP256K1_FIELD_ORDER =
  0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;

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
  // x is a coordinate in the secp256k1 base field, so the only range it
  // has to satisfy is x < p. A leading 0x00 byte is an ordinary small
  // coordinate and occurs in about one key in 256; the loop this replaces
  // rejected exactly those and was dead code for every other position,
  // because it only ever raised when i - 1 was 0.
  let x = 0n;
  for (let i = 1; i < raw.length; i++) x = (x << 8n) | BigInt(raw[i]!);
  if (x >= SECP256K1_FIELD_ORDER) {
    throw new RangeError("Compressed pubkey x coordinate is not below the secp256k1 field order");
  }
  if (x === 0n) {
    throw new RangeError("Compressed pubkey x coordinate must not be zero");
  }
  // Copied, not a view: parseAtomicSwapScript hands in a subarray of the
  // script it is decoding, and a returned view would alias those bytes.
  return { parity: prefix as 0x02 | 0x03, x: raw.slice(1) };
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
