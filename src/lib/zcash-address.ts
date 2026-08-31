// Two surfaces share this file:
//
// 1. `inspectTransparentDestination` is the existing pre-PR-3 destination
//    classifier used by the bridge and payout surfaces. It is read-only
//    and never touches a hash function.
//
// 2. The Base58Check transparent address encoder and decoder. The
//    wrapper around Node's ripemd160 is the only hash function this
//    file uses; the address surface is the only surface in PR 3 that
//    depends on a hash function. The browser path is a follow-up
//    because Web Crypto does not expose ripemd160.
//
// Version bytes:
//   testnet P2PKH: 0x1D25 (prefix "tm")
//   testnet P2SH:  0x1CBA (prefix "t2")
//   mainnet P2PKH: 0x1CB8 (prefix "t1")
//   mainnet P2SH:  0x1CBD (prefix "t3")

import { base58checkEncode, base58checkDecode } from "./base58check.ts";
import { ripemd160Hex } from "./ripemd160.ts";
import { createHash } from "node:crypto";

export type DestinationInspection = {
  class: "empty" | "placeholder" | "shielded" | "tex" | "transparent-shape" | "unrecognized";
  eligibleLater: boolean;
  message: string;
};

const TRANSPARENT_SHAPE = /^t[13][1-9A-HJ-NP-Za-km-z]{25,50}$/;

export function inspectTransparentDestination(value: string): DestinationInspection {
  const destination = value.trim();
  if (destination.length === 0) {
    return {
      class: "empty",
      eligibleLater: false,
      message: "Enter a destination to inspect. This simulation never sends ZEC.",
    };
  }
  if (destination.includes("{TEX_ADDRESS}") || destination.startsWith("zcash:")) {
    return {
      class: "placeholder",
      eligibleLater: false,
      message: "Payment-request templates are not payout destinations.",
    };
  }
  if (/^tex1[0-9a-z]+$/i.test(destination)) {
    return {
      class: "tex",
      eligibleLater: false,
      message: "TEX is for deposits. This interface does not accept TEX payouts.",
    };
  }
  if (/^[zu][a-z0-9]/i.test(destination)) {
    return {
      class: "shielded",
      eligibleLater: false,
      message: "Shielded and unified addresses are out of scope. Withdrawals accept only a network-correct transparent destination under the proposed policy.",
    };
  }
  if (TRANSPARENT_SHAPE.test(destination)) {
    return {
      class: "transparent-shape",
      eligibleLater: false,
      message: "Transparent-shape input noted. No wallet is Phlebas-verified, and this simulation does not send ZEC.",
    };
  }
  return {
    class: "unrecognized",
    eligibleLater: false,
    message: "Unrecognized destination. A later testnet would accept only a network-correct transparent address.",
  };
}

export type ZcashNetwork = "testnet" | "mainnet";

export const VERSION_BYTES: Readonly<Record<`${ZcashNetwork}_${"p2pkh" | "p2sh"}`, number>> = {
  testnet_p2pkh: 0x1d25,
  testnet_p2sh: 0x1cba,
  mainnet_p2pkh: 0x1cb8,
  mainnet_p2sh: 0x1cbd,
};

export function p2pkhAddress(pubkeyHash20: Uint8Array, network: ZcashNetwork = "testnet"): string {
  if (pubkeyHash20.length !== 20) {
    throw new RangeError(`P2PKH payload must be 20 bytes, got ${pubkeyHash20.length}`);
  }
  const version = VERSION_BYTES[`${network}_p2pkh`];
  return encodeWithVersion(version, pubkeyHash20);
}

export function p2shAddress(scriptHash20: Uint8Array, network: ZcashNetwork = "testnet"): string {
  if (scriptHash20.length !== 20) {
    throw new RangeError(`P2SH payload must be 20 bytes, got ${scriptHash20.length}`);
  }
  const version = VERSION_BYTES[`${network}_p2sh`];
  return encodeWithVersion(version, scriptHash20);
}

export function hash160Value(message: Uint8Array): Uint8Array {
  const sha = createHash("sha256");
  sha.update(message);
  const ripemd = ripemd160Hex(sha.digest());
  return hexToBytes(ripemd);
}

export function pubkeyHash160(compressedPubkey: Uint8Array): Uint8Array {
  if (compressedPubkey.length !== 33) {
    throw new RangeError("Compressed pubkey must be 33 bytes");
  }
  return hash160Value(compressedPubkey);
}

function encodeWithVersion(version: number, payload: Uint8Array): string {
  const full = new Uint8Array(2 + payload.length);
  full[0] = (version >> 8) & 0xff;
  full[1] = version & 0xff;
  full.set(payload, 2);
  return base58checkEncode(full);
}

export function decodeAddress(value: string): Readonly<{ network: ZcashNetwork; kind: "p2pkh" | "p2sh"; payload: Uint8Array }> {
  const decoded = base58checkDecode(value);
  if (decoded.length !== 22) throw new RangeError("Zcash address payload must be 22 bytes after Base58Check");
  const version = (decoded[0] << 8) | decoded[1];
  const payload = decoded.subarray(2);
  for (const [k, v] of Object.entries(VERSION_BYTES)) {
    if (v === version) {
      const [network, kind] = k.split("_") as [ZcashNetwork, "p2pkh" | "p2sh"];
      return { network, kind, payload };
    }
  }
  throw new RangeError(`Unknown Zcash address version: 0x${version.toString(16)}`);
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
