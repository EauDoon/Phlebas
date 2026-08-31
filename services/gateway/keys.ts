import { createECDH, createHash, createHmac, randomBytes } from "node:crypto";

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
  if (!Number.isSafeInteger(sequence) || sequence < 0) {
    throw new RangeError("Sequence must be a non-negative safe integer");
  }
  const index = Buffer.alloc(8);
  index.writeBigUInt64BE(BigInt(sequence));
  for (let attempt = 0; attempt < 256; attempt += 1) {
    const candidate = createHmac("sha256", master)
      .update("phlebas-testnet-tex-v1")
      .update(index)
      .update(Uint8Array.of(attempt))
      .digest();
    const scalar = BigInt(`0x${candidate.toString("hex")}`);
    if (scalar > 0n && scalar < 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n) {
      return candidate;
    }
  }
  throw new Error("Unable to derive a valid secp256k1 child key");
}

export function newMasterKey(): Uint8Array {
  return randomBytes(32);
}

export function masterKeyHex(master: Uint8Array): string {
  return bytesToHex(master);
}
