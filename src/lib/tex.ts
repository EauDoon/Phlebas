import { decodeBech32m, encodeBech32m } from "./bech32m.ts";
import { bytesToHex, hexToBytes } from "./keccak.ts";

export const TESTNET_TEX_HRP = "textest";
export const MAINNET_TEX_HRP = "tex";
export const TEX_PAYLOAD_LENGTH = 20;

export type TexNetwork = "testnet" | "mainnet";

export function encodeTex(payload: Uint8Array, network: TexNetwork = "testnet"): string {
  if (payload.length !== TEX_PAYLOAD_LENGTH) {
    throw new RangeError("TEX payload must be a 20-byte P2PKH hash");
  }
  if (network !== "testnet") {
    throw new TypeError("This repository encodes testnet TEX only");
  }
  return encodeBech32m(TESTNET_TEX_HRP, payload);
}

export function decodeTex(address: string): { network: TexNetwork; payload: Uint8Array } {
  const { hrp, payload } = decodeBech32m(address.trim());
  if (payload.length !== TEX_PAYLOAD_LENGTH) {
    throw new RangeError("TEX payload must be a 20-byte P2PKH hash");
  }
  if (hrp === TESTNET_TEX_HRP) {
    return { network: "testnet", payload };
  }
  if (hrp === MAINNET_TEX_HRP) {
    return { network: "mainnet", payload };
  }
  throw new TypeError("Address is not ZIP 320 TEX");
}

export function isTestnetTex(address: string): boolean {
  try {
    return decodeTex(address).network === "testnet";
  } catch {
    return false;
  }
}

export function encodeTexFromHashHex(hashHex: string): string {
  return encodeTex(hexToBytes(hashHex), "testnet");
}

export function texPayloadHex(address: string): string {
  return bytesToHex(decodeTex(address).payload);
}
