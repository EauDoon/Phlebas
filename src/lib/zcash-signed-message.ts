import { bytesToHex } from "./bytes-hex.ts";
import { recoverCompactPublicKey } from "./secp256k1.ts";
import { sha256 } from "./sha256.ts";
import { decodeZcashTransparentAccount, hash160Value } from "./zcash-address.ts";
import { concatBytes } from "./zcash-script.ts";

function serializedString(value: string): Uint8Array {
  const bytes = new TextEncoder().encode(value);
  // Both inputs are bounded below: the fixed magic and a 16–512 byte ASCII challenge.
  const length = bytes.length < 0xfd
    ? Uint8Array.of(bytes.length)
    : Uint8Array.of(0xfd, bytes.length & 0xff, bytes.length >>> 8);
  return concatBytes([length, bytes]);
}

/**
 * Verify a zcashd-format compact signature for a canonical Mainnet P2PKH account.
 * Uses the existing wallet adapter's 16–512 printable-ASCII challenge policy.
 * This proves only a signature over these bytes, not freshness, wallet qualification,
 * transaction authority, or permission to sign or broadcast a transaction.
 */
export function verifyZcashTransparentSignedMessage(
  account: string,
  message: string,
  signatureBase64: string,
): boolean {
  if (typeof account !== "string" || account.length > 64
    || typeof message !== "string" || message.length > 512 || !/^[ -~]{16,512}$/.test(message)
    || typeof signatureBase64 !== "string" || signatureBase64.length !== 88
    || !/^[A-Za-z0-9+/]{87}=$/.test(signatureBase64)) return false;

  try {
    const identity = decodeZcashTransparentAccount(account);
    if (identity.network !== "mainnet" || identity.kind !== "p2pkh") return false;
    const decoded = atob(signatureBase64);
    if (decoded.length !== 65 || btoa(decoded) !== signatureBase64) return false;
    const compact = Uint8Array.from(decoded, (character) => character.charCodeAt(0));
    const digest = sha256(sha256(concatBytes([
      serializedString("Zcash Signed Message:\n"),
      serializedString(message),
    ])));
    const publicKey = recoverCompactPublicKey(bytesToHex(digest), bytesToHex(compact));
    return hash160Value(publicKey).every((byte, index) => byte === identity.payload[index]);
  } catch {
    return false;
  }
}
