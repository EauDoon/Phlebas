import { hexToBytes } from "./bytes-hex.ts";
import {
  parseZcashArtifact,
  serializeZcashArtifact,
  type ArtifactInput,
  type ArtifactOutput,
  type CommittedZcashArtifact,
} from "./zcash-artifact.ts";
import { serializeOutpoint } from "./zcash-outpoint.ts";

const V5_HEADER = 0x8000_0005;
const MAX_UINT32 = 0xffff_ffff;

function uint32(value: number): Buffer {
  const out = Buffer.alloc(4);
  out.writeUInt32LE(value);
  return out;
}

function amount(value: string): Buffer {
  const out = Buffer.alloc(8);
  out.writeBigInt64LE(BigInt(value));
  return out;
}

// Artifact bounds keep counts and script lengths below 65536; use only the
// canonical one- or three-byte CompactSize forms here.
function compactSize(value: number, label: string): Buffer {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff) {
    throw new RangeError(`${label} must fit the bounded uint16 CompactSize range`);
  }
  return value < 0xfd
    ? Buffer.from([value])
    : Buffer.from([0xfd, value & 0xff, (value >>> 8) & 0xff]);
}

function encodedScript(value: string, label: string): Buffer {
  const bytes = hexToBytes(value);
  return Buffer.concat([compactSize(bytes.length, `${label} length`), bytes]);
}

function encodedInput(input: ArtifactInput): Buffer {
  return Buffer.concat([
    hexToBytes(serializeOutpoint({ txid: input.txid, vout: input.outputIndex })),
    compactSize(0, "Unsigned input scriptSig length"),
    uint32(input.sequence),
  ]);
}

function encodedOutput(output: ArtifactOutput): Buffer {
  return Buffer.concat([
    amount(output.valueZatoshis),
    encodedScript(output.scriptPubKeyHex, "Artifact output scriptPubKey"),
  ]);
}

/**
 * Serialize the unsigned transparent-only v5 candidate encoding.
 * Every input has an empty scriptSig. This emits bytes only; it does not
 * produce or verify signatures, transaction IDs, PCZTs, readiness, or relay.
 */
export function serializeUnsignedV5TransparentTransaction(
  artifact: CommittedZcashArtifact | string,
): Uint8Array {
  const { manifest } = typeof artifact === "string"
    ? parseZcashArtifact(artifact)
    : parseZcashArtifact(serializeZcashArtifact(artifact));
  if (manifest.profile.transactionVersion !== 5) {
    throw new RangeError("Unsigned transparent transaction serialization supports only v5");
  }
  if (manifest.inputs.some((input) => (
    input.txid === "00".repeat(32) && input.outputIndex === MAX_UINT32
  ))) {
    throw new RangeError(
      "Coinbase inputs are not supported by the unsigned transparent transaction serializer",
    );
  }

  const header = Buffer.alloc(20);
  header.writeUInt32LE(V5_HEADER, 0);
  header.writeUInt32LE(Number.parseInt(manifest.profile.versionGroupId, 16), 4);
  header.writeUInt32LE(Number.parseInt(manifest.profile.consensusBranchId, 16), 8);
  header.writeUInt32LE(manifest.lockTime, 12);
  header.writeUInt32LE(manifest.expiryHeight, 16);

  return Buffer.concat([
    header,
    compactSize(manifest.inputs.length, "Transparent input count"),
    ...manifest.inputs.map(encodedInput),
    compactSize(manifest.outputs.length, "Transparent output count"),
    ...manifest.outputs.map(encodedOutput),
    // Final ZIP 225 v5: zero Sapling counts omit the conditional Sapling
    // fields, and zero Orchard actions omit the Orchard component.
    compactSize(0, "Sapling spend count"),
    compactSize(0, "Sapling output count"),
    compactSize(0, "Orchard action count"),
  ]);
}
