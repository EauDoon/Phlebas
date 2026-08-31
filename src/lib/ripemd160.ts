// Thin wrapper over Node 24's built-in ripemd160. The browser path is a
// follow-up: Web Crypto does not expose ripemd160, so a WASM or pure-JS
// polyfill is required before the Zcash address encoder can run in the
// browser. The Node path is the only path tested in this PR.

import { createHash } from "node:crypto";

export function ripemd160Hex(message: Uint8Array): string {
  const hash = createHash("ripemd160");
  hash.update(message);
  return hash.digest("hex");
}
