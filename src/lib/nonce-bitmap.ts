/** Matches Settlement.sol: word = nonce >> 8, bit = 1 << uint8(nonce). */

export type NonceBitmap = Map<bigint, bigint>;

export function emptyNonceBitmap(): NonceBitmap {
  return new Map();
}

export function cancelNonce(bitmap: NonceBitmap, nonce: bigint): NonceBitmap {
  const word = nonce >> 8n;
  const bit = 1n << (nonce & 255n);
  const next = new Map(bitmap);
  next.set(word, (next.get(word) ?? 0n) | bit);
  return next;
}

export function isNonceCancelled(bitmap: NonceBitmap, nonce: bigint): boolean {
  const word = nonce >> 8n;
  const bit = 1n << (nonce & 255n);
  return ((bitmap.get(word) ?? 0n) & bit) !== 0n;
}
