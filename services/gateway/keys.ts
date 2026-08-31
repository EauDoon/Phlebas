import { createECDH, createHash, randomBytes } from "node:crypto";

import { bytesToHex } from "../../src/lib/keccak.ts";

export function hash160(bytes: Uint8Array): Uint8Array {
  const sha = createHash("sha256").update(bytes).digest();
  return createHash("ripemd160").update(sha).digest();
}

export function compressedPublicKey(privateKey: Uint8Array): Uint8Array {
  const ecdh = createECDH("secp256k1");
  ecdh.setPrivateKey(Buffer.from(privateKey));
  return new Uint8Array(ecdh.getPublicKey(null, "compressed"));
}

export function p2pkhHashFromPrivateKey(privateKey: Uint8Array): Uint8Array {
  return hash160(compressedPublicKey(privateKey));
}

export function deriveTestnetChildKey(master: Uint8Array, sequence: number): Uint8Array {
  if (master.length !== 32) {
    throw new RangeError("Master key must be 32 bytes");
  }
  if (!Number.isInteger(sequence) || sequence < 0) {
    throw new RangeError("Sequence must be a non-negative integer");
  }
  const material = Buffer.concat([
    Buffer.from("phlebas-testnet-tex-v1"),
    Buffer.from(master),
    Buffer.from(String(sequence)),
  ]);
  return createHash("sha256").update(material).digest();
}

export function newMasterKey(): Uint8Array {
  return randomBytes(32);
}

export function masterKeyHex(master: Uint8Array): string {
  return bytesToHex(master);
}
