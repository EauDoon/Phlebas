// Derive a transparent P2SH address from a redeem script. The script
// hash is RIPEMD160(SHA256(script)). The address encodes the hash with
// the network's P2SH version byte and a Base58Check checksum.

import { hash160Value, p2shAddress, type ZcashNetwork } from "./zcash-address.ts";

export function scriptAddress(script: Uint8Array, network: ZcashNetwork = "testnet"): string {
  return p2shAddress(hash160Value(script), network);
}
