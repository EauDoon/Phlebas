// Double SHA-256. Used in the Base58Check checksum and in any place the
// project needs the Bitcoin/Zcash-style 32-byte commitment hash.

import { createHash } from "node:crypto";

export function sha256dHex(message: Uint8Array): string {
  const first = createHash("sha256");
  first.update(message);
  const second = createHash("sha256");
  second.update(first.digest());
  return second.digest("hex");
}

export function sha256d(message: Uint8Array): Uint8Array {
  const first = createHash("sha256");
  first.update(message);
  const second = createHash("sha256");
  second.update(first.digest());
  return second.digest();
}
