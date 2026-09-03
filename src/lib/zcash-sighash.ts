import { blake2b } from "@noble/hashes/blake2.js";
import { bytesToHex, hexToBytes } from "./bytes-hex.ts";
import type { Hex32 } from "./order-domain.ts";
import {
  parseZcashArtifact,
  serializeZcashArtifact,
  type CommittedZcashArtifact,
} from "./zcash-artifact.ts";
import { serializeOutpoint } from "./zcash-outpoint.ts";

function uint32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function amount(value: string): Buffer {
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
}

function script(value: string): Buffer {
  const bytes = hexToBytes(value);
  // The committed artifact permits only 23-byte P2SH and 25-byte P2PKH scripts.
  // Expand CompactSize encoding only when that artifact contract expands.
  if (bytes.length !== 23 && bytes.length !== 25) throw new RangeError("Unsupported transparent script size");
  return Buffer.concat([Uint8Array.of(bytes.length), bytes]);
}

function digest(personalization: string | Uint8Array, parts: readonly Uint8Array[]): Uint8Array {
  return blake2b(Buffer.concat(parts), {
    dkLen: 32,
    personalization: typeof personalization === "string" ? new TextEncoder().encode(personalization) : personalization,
  });
}

/**
 * ZIP 244 v5 transparent SIGHASH_ALL over a verified unsigned lab manifest.
 * This computes no signature, transaction ID, wallet qualification, or relay proof.
 * V6 requires separately verified ZIP 229 rules and independent vectors.
 */
export function computeTransparentSighash(
  artifact: CommittedZcashArtifact | string,
  inputIndex: number,
): Hex32 {
  const { manifest } = parseZcashArtifact(typeof artifact === "string" ? artifact : serializeZcashArtifact(artifact));
  if (manifest.profile.transactionVersion !== 5) throw new RangeError("Transparent sighash currently supports only v5 ZIP 244");
  if (!Number.isSafeInteger(inputIndex) || inputIndex < 0 || inputIndex >= manifest.inputs.length) {
    throw new RangeError("Transparent sighash input index is out of range");
  }
  if (manifest.inputs.some((input) => input.txid === "00".repeat(32) && input.outputIndex === 0xffff_ffff)) {
    throw new RangeError("Coinbase inputs are not supported by the transparent signing path");
  }

  const branch = uint32(Number.parseInt(manifest.profile.consensusBranchId, 16));
  const header = digest("ZTxIdHeadersHash", [
    uint32(0x8000_0005),
    uint32(Number.parseInt(manifest.profile.versionGroupId, 16)),
    branch,
    uint32(manifest.lockTime),
    uint32(manifest.expiryHeight),
  ]);
  const inputs = manifest.inputs.map((input) => ({
    prevout: hexToBytes(serializeOutpoint({ txid: input.txid, vout: input.outputIndex })),
    amount: amount(input.valueZatoshis),
    script: script(input.scriptPubKeyHex),
    sequence: uint32(input.sequence),
  }));
  const selected = inputs[inputIndex];
  const transparent = digest("ZTxIdTranspaHash", [
    Uint8Array.of(1),
    digest("ZTxIdPrevoutHash", inputs.map((input) => input.prevout)),
    digest("ZTxTrAmountsHash", inputs.map((input) => input.amount)),
    digest("ZTxTrScriptsHash", inputs.map((input) => input.script)),
    digest("ZTxIdSequencHash", inputs.map((input) => input.sequence)),
    digest("ZTxIdOutputsHash", manifest.outputs.flatMap((output) => [amount(output.valueZatoshis), script(output.scriptPubKeyHex)])),
    // ZIP 244 commits to the spent coin's scriptPubKey, including for P2SH.
    digest("Zcash___TxInHash", [selected.prevout, selected.amount, selected.script, selected.sequence]),
  ]);
  return bytesToHex(digest(Buffer.concat([Buffer.from("ZcashTxHash_", "ascii"), branch]), [
    header,
    transparent,
    digest("ZTxIdSaplingHash", []),
    digest("ZTxIdOrchardHash", []),
  ])) as Hex32;
}
