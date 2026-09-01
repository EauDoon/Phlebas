// Key-independent canonical byte-size computation for transparent Zcash
// transactions. Computes the exact wire size of a version 4, 5, or 6
// transaction given the input scriptSig lengths and output scriptPubKey
// lengths, plus the locktime, version group id, and expiry height.
//
// This does not produce a transaction identifier. It produces a byte
// count that wallet builders and fee policy validators can use to
// reconcile the agreed funding, claim, and refund templates with the
// canonical serialization that the wallet will eventually sign.
//
// The output is independent of the signing key material and never
// touches a node, a wallet, or the network. The function is pure.

export type TransparentTxVersion = 4 | 5 | 6;

export type TransparentInputSize = Readonly<{
  scriptSigLength: number;
}>;

export type TransparentOutputSize = Readonly<{
  scriptPubKeyHex: string;
}>;

export type ComputeTransparentSizeRequest = Readonly<{
  version: TransparentTxVersion;
  inputs: readonly TransparentInputSize[];
  outputs: readonly TransparentOutputSize[];
  lockTime: number;
}>;

const VERSION_5_GROUP_ID_BYTES = 4;
const EXPIRY_BYTES = 4;
const INPUT_OUTPOINT_BYTES = 32 + 4;
const INPUT_SEQUENCE_BYTES = 4;
const OUTPUT_VALUE_BYTES = 8;
const LOCKTIME_BYTES = 4;

function uint32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
  return value;
}

function varIntSize(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError("varint value must be a non-negative safe integer");
  }
  if (value < 0xfd) return 1;
  if (value <= 0xffff) return 3;
  if (value <= 0xffffffff) return 5;
  return 9;
}

function scriptPubKeyBytes(scriptPubKeyHex: string): Uint8Array {
  if (typeof scriptPubKeyHex !== "string") {
    throw new TypeError("scriptPubKey hex must be a string");
  }
  const prefix = scriptPubKeyHex.startsWith("0x") ? scriptPubKeyHex.slice(2) : scriptPubKeyHex;
  if (prefix.length % 2 !== 0) {
    throw new RangeError("scriptPubKey hex must have an even number of nibbles");
  }
  if (!/^[0-9a-fA-F]*$/.test(prefix)) {
    throw new TypeError("scriptPubKey hex must be lowercase or uppercase hexadecimal");
  }
  const out = new Uint8Array(prefix.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(prefix.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function computeTransparentTransactionSize(
  request: ComputeTransparentSizeRequest,
): number {
  if (request.version !== 4 && request.version !== 5 && request.version !== 6) {
    throw new RangeError("Transparent transaction version must be 4, 5, or 6");
  }
  uint32(request.lockTime, "lockTime");
  const hasGroupId = request.version === 5 || request.version === 6;
  const hasExpiry = request.version === 5 || request.version === 6;

  let size = 4; // version
  if (hasGroupId) size += VERSION_5_GROUP_ID_BYTES;
  size += varIntSize(request.inputs.length);
  for (const input of request.inputs) {
    if (!Number.isSafeInteger(input.scriptSigLength) || input.scriptSigLength < 0) {
      throw new RangeError("scriptSigLength must be a non-negative safe integer");
    }
    if (input.scriptSigLength > 0xffff_ffff) {
      throw new RangeError("scriptSigLength cannot exceed uint32");
    }
    size += INPUT_OUTPOINT_BYTES;
    size += varIntSize(input.scriptSigLength);
    size += input.scriptSigLength;
    size += INPUT_SEQUENCE_BYTES;
  }
  size += varIntSize(request.outputs.length);
  for (const output of request.outputs) {
    const scriptBytes = scriptPubKeyBytes(output.scriptPubKeyHex);
    size += OUTPUT_VALUE_BYTES;
    size += varIntSize(scriptBytes.length);
    size += scriptBytes.length;
  }
  size += LOCKTIME_BYTES;
  if (hasExpiry) size += EXPIRY_BYTES;
  return size;
}

export type ComputeFundingSizeRequest = Readonly<{
  version: TransparentTxVersion;
  inputCount: number;
  fundingScriptPubKeyHex: string;
  changeScriptPubKeyHex?: string;
  lockTime: number;
}>;

export function computeFundingTransactionSize(
  request: ComputeFundingSizeRequest,
): Readonly<{ withoutChange: number; withChange: number }> {
  if (!Number.isSafeInteger(request.inputCount) || request.inputCount < 1) {
    throw new RangeError("Funding transaction must include at least one input");
  }
  if (request.inputCount > 0xffff_ffff) {
    throw new RangeError("inputCount cannot exceed uint32");
  }
  const inputs: TransparentInputSize[] = Array.from(
    { length: request.inputCount },
    () => ({ scriptSigLength: 0 }),
  );
  const withoutChange = computeTransparentTransactionSize({
    version: request.version,
    inputs,
    outputs: [{ scriptPubKeyHex: request.fundingScriptPubKeyHex }],
    lockTime: request.lockTime,
  });
  if (request.changeScriptPubKeyHex === undefined) {
    return { withoutChange, withChange: withoutChange };
  }
  const withChange = computeTransparentTransactionSize({
    version: request.version,
    inputs,
    outputs: [
      { scriptPubKeyHex: request.fundingScriptPubKeyHex },
      { scriptPubKeyHex: request.changeScriptPubKeyHex },
    ],
    lockTime: request.lockTime,
  });
  return { withoutChange, withChange };
}
