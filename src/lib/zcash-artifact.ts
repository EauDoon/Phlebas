import { createHash } from "node:crypto";

import {
  assessSerializedTransactionSize,
  validateTransparentFee,
  zip317TransparentConventionalFee,
  type FinalizedTransparentSize,
  type TransparentFeePolicy,
} from "./zcash-fees.ts";
import { bytesToHex, hexToBytes } from "./keccak.ts";
import { htlcP2shScriptPubKey, htlcTemplatePolicyReport, validateHtlcRedeemScript } from "./zcash-htlc.ts";
import type { ZcashNetwork } from "./zcash-transparent.ts";
import { p2pkhScriptPubKey } from "./zcash-transparent.ts";

export const ZCASH_ARTIFACT_SCHEMA = "phlebas-zcash-transparent-artifact-v1";
export const ZCASH_ARTIFACT_BOUNDARY = "candidate-unsigned-effecting-data-manifest";
export const ZCASH_SERIALIZED_SIZE_UNRESOLVED_REASON = "complete-canonical-transaction-not-supplied" as const;
export const ZCASH_RELAYABILITY_UNRESOLVED = "unresolved-requires-complete-transaction-and-node-policy" as const;

export type ZcashArtifactKind = "fund" | "claim" | "refund";

export type ArtifactInput = Readonly<{
  txid: string;
  outputIndex: number;
  sequence: number;
  valueZatoshis: string;
  scriptPubKeyHex: string;
}>;

export type ArtifactOutput = Readonly<{
  role: "contract" | "recipient" | "change";
  valueZatoshis: string;
  scriptPubKeyHex: string;
}>;

export type ArtifactRefundMaturityEvidence = Readonly<{
  lockType: "height" | "timestamp";
  currentBlockHeight: number;
  medianTimePast: number | null;
}>;

export type ArtifactConstructionPolicy = Readonly<{
  feePolicy: Readonly<{
    id: "zip317-transparent-r0-r1";
    maximumFeeZatoshis: string;
    minimumOutputZatoshis: string;
    maximumSerializedTransactionBytes: number;
    finalizedTransparentInputBytes: number;
    finalizedTransparentOutputBytes: number;
    conventionalFeeZatoshis: string;
  }>;
  serializedTransactionSize: Readonly<{
    state: "unresolved";
    actualBytes: null;
    reason: typeof ZCASH_SERIALIZED_SIZE_UNRESOLVED_REASON;
  }>;
  relayability: typeof ZCASH_RELAYABILITY_UNRESOLVED;
  observedHeight: number | null;
  refundMaturity: ArtifactRefundMaturityEvidence | null;
}>;

export type UnsignedTransparentManifest = Readonly<{
  schema: typeof ZCASH_ARTIFACT_SCHEMA;
  boundary: typeof ZCASH_ARTIFACT_BOUNDARY;
  kind: ZcashArtifactKind;
  network: ZcashNetwork;
  profile: Readonly<{
    id: string;
    transactionVersion: 5 | 6;
    versionGroupId: string;
    consensusBranchId: string;
    coinType: number;
  }>;
  targetHeight: number;
  expiryHeight: number;
  lockTime: number;
  inputs: readonly ArtifactInput[];
  outputs: readonly ArtifactOutput[];
  feeZatoshis: string;
  policy: ArtifactConstructionPolicy;
  authorization: Readonly<{
    sighashType: "SIGHASH_ALL";
    sighashCode: 1;
    txModifiable: 0;
    branch: "fund" | "claim" | "refund";
    redeemScriptHex?: string;
    preimageHex?: string;
    refundSafetyMargin?: Readonly<{ type: "height" | "timestamp"; value: number }>;
    fundingLockCutoff?: number;
  }>;
  transactionIdState: "unresolved-until-canonical-transaction-extraction";
}>;

export type CommittedZcashArtifact = Readonly<{
  manifest: UnsignedTransparentManifest;
  manifestDigest: string;
}>;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function canonicalize(value: unknown, path: string): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError(`${path} must contain only safe integer numbers`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => canonicalize(entry, `${path}[${index}]`)).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const prototype = Object.getPrototypeOf(record);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError(`${path} must contain only plain objects`);
    }
    const keys = Object.keys(record).sort();
    for (const key of keys) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        throw new TypeError(`${path} contains a forbidden object key`);
      }
      if (record[key] === undefined) throw new TypeError(`${path}.${key} must not be undefined`);
    }
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key], `${path}.${key}`)}`).join(",")}}`;
  }
  throw new TypeError(`${path} contains a non-JSON value`);
}

export function canonicalArtifactJson(value: JsonValue): string {
  return canonicalize(value, "artifact");
}

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function parseCanonicalJson(serialized: string): JsonValue {
  if (serialized.length === 0 || serialized.trim() !== serialized) {
    throw new TypeError("Serialized artifact must not contain surrounding whitespace");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new TypeError("Serialized artifact is not valid JSON");
  }
  const canonical = canonicalize(parsed, "artifact");
  if (canonical !== serialized) throw new TypeError("Serialized artifact is not canonical JSON");
  return parsed as JsonValue;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

export function createArtifactConstructionPolicy(options: {
  feePolicy: TransparentFeePolicy;
  finalizedSize: FinalizedTransparentSize;
  feeZatoshis: bigint;
  observedHeight?: number;
  refundMaturity?: ArtifactRefundMaturityEvidence;
}): ArtifactConstructionPolicy {
  if (options.feePolicy.id !== "zip317-transparent-r0-r1") {
    throw new TypeError("Artifact fee policy must be the pinned ZIP 317 transparent policy");
  }
  validateTransparentFee(options.feePolicy, options.finalizedSize, options.feeZatoshis);
  const serializedSize = assessSerializedTransactionSize(options.feePolicy);
  if (serializedSize.state !== "unresolved") {
    throw new Error("Artifact construction without canonical transaction bytes must leave serialized size unresolved");
  }
  const policy: ArtifactConstructionPolicy = {
    feePolicy: {
      id: "zip317-transparent-r0-r1",
      maximumFeeZatoshis: options.feePolicy.maximumFeeZatoshis.toString(),
      minimumOutputZatoshis: options.feePolicy.minimumOutputZatoshis.toString(),
      maximumSerializedTransactionBytes: options.feePolicy.maximumSerializedTransactionBytes,
      finalizedTransparentInputBytes: options.finalizedSize.inputBytes,
      finalizedTransparentOutputBytes: options.finalizedSize.outputBytes,
      conventionalFeeZatoshis: options.feePolicy.conventionalFee(options.finalizedSize).toString(),
    },
    serializedTransactionSize: {
      state: "unresolved",
      actualBytes: null,
      reason: ZCASH_SERIALIZED_SIZE_UNRESOLVED_REASON,
    },
    relayability: ZCASH_RELAYABILITY_UNRESOLVED,
    observedHeight: options.observedHeight ?? null,
    refundMaturity: options.refundMaturity ?? null,
  };
  return deepFreeze(policy);
}

function recordValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  if (actual.length !== sortedExpected.length || actual.some((key, index) => key !== sortedExpected[index])) {
    throw new TypeError(`${label} contains missing or unexpected fields`);
  }
}

function allowedKeys(
  record: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[],
  label: string,
): void {
  const keys = Object.keys(record);
  if (required.some((key) => !keys.includes(key)) || keys.some((key) => !required.includes(key) && !optional.includes(key))) {
    throw new TypeError(`${label} contains missing or unexpected fields`);
  }
}

function manifestUint32(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
  return value;
}

function manifestPositiveSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${label} must be a positive safe integer`);
  }
  return value;
}

function manifestZatoshis(value: unknown, label: string): bigint {
  if (typeof value !== "string" || !/^[1-9][0-9]*$/.test(value)) {
    throw new TypeError(`${label} must be a canonical positive decimal string`);
  }
  const parsed = BigInt(value);
  if (parsed > 2_100_000_000_000_000n) throw new RangeError(`${label} exceeds the ZEC supply bound`);
  return parsed;
}

function manifestHex(value: unknown, label: string, exactBytes?: number): string {
  if (typeof value !== "string" || !/^(?:[0-9a-f]{2})+$/.test(value)) {
    throw new TypeError(`${label} must be non-empty lowercase whole-byte hexadecimal`);
  }
  if (value.length > 20_000) throw new RangeError(`${label} exceeds the artifact script bound`);
  if (exactBytes !== undefined && value.length !== exactBytes * 2) {
    throw new RangeError(`${label} must be exactly ${exactBytes} bytes`);
  }
  return value;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

function validateP2pkhScriptHex(value: string, expectedHash?: Uint8Array): void {
  const bytes = hexToBytes(value);
  if (bytes.length !== 25 || bytes[0] !== 0x76 || bytes[1] !== 0xa9 || bytes[2] !== 0x14
    || bytes[23] !== 0x88 || bytes[24] !== 0xac) {
    throw new TypeError("Artifact P2PKH script does not use the canonical template");
  }
  if (expectedHash && !sameBytes(bytes, p2pkhScriptPubKey(expectedHash))) {
    throw new Error("Artifact recipient script does not match the HTLC branch public-key hash");
  }
}

function validateArtifactSemantics(manifest: UnsignedTransparentManifest): void {
  const redeemScript = hexToBytes(manifest.authorization.redeemScriptHex as string);
  const htlc = validateHtlcRedeemScript(redeemScript);
  const templatePolicy = htlcTemplatePolicyReport(redeemScript);
  if (!templatePolicy.templatePolicyPasses) throw new TypeError("Artifact redeemScript fails the HTLC template policy");
  const p2shHex = bytesToHex(htlcP2shScriptPubKey(redeemScript));

  if (manifest.kind === "fund") {
    if (manifest.outputs[0].scriptPubKeyHex !== p2shHex) {
      throw new Error("Funding contract output does not match the HTLC redeemScript hash");
    }
    for (const input of manifest.inputs) validateP2pkhScriptHex(input.scriptPubKeyHex);
    if (manifest.outputs[1]) validateP2pkhScriptHex(manifest.outputs[1].scriptPubKeyHex);
    const margin = manifest.authorization.refundSafetyMargin;
    if (!margin || margin.type !== htlc.lock.type || !Number.isSafeInteger(margin.value) || margin.value <= 0) {
      throw new RangeError("Funding artifact refund safety margin is invalid");
    }
    const cutoff = manifestUint32(manifest.authorization.fundingLockCutoff, "Funding artifact lock cutoff");
    if (htlc.lock.type === "height" && cutoff !== manifest.targetHeight) {
      throw new Error("Funding height cutoff must equal the artifact target height");
    }
    if (htlc.lock.type === "timestamp" && cutoff < 500_000_000) {
      throw new RangeError("Funding timestamp cutoff is outside the timestamp locktime domain");
    }
    if (htlc.lock.value <= cutoff || htlc.lock.value - cutoff < margin.value) {
      throw new RangeError("Funding artifact does not preserve its committed refund safety margin");
    }
    return;
  }

  if (manifest.inputs.length !== 1 || manifest.inputs[0].scriptPubKeyHex !== p2shHex) {
    throw new Error("Spend contract input does not match the HTLC redeemScript hash");
  }
  const expectedPkh = manifest.kind === "claim" ? htlc.claimPkh : htlc.refundPkh;
  validateP2pkhScriptHex(manifest.outputs[0].scriptPubKeyHex, expectedPkh);
  if (manifest.kind === "claim") {
    const preimage = hexToBytes(manifest.authorization.preimageHex as string);
    const digest = createHash("sha256").update(preimage).digest();
    if (!sameBytes(digest, htlc.digest)) throw new Error("Artifact claim preimage does not match the HTLC digest");
  } else {
    if (manifest.lockTime !== htlc.lock.value) {
      throw new Error("Refund artifact locktime does not match the HTLC redeemScript");
    }
    const maturity = manifest.policy.refundMaturity as ArtifactRefundMaturityEvidence;
    if (maturity.lockType !== htlc.lock.type) {
      throw new Error("Refund artifact maturity evidence does not match the HTLC locktime domain");
    }
    if (htlc.lock.type === "height") {
      if (maturity.medianTimePast !== null || maturity.currentBlockHeight <= htlc.lock.value) {
        throw new Error("Refund artifact does not contain mature height evidence");
      }
    } else if (maturity.medianTimePast === null || maturity.medianTimePast <= htlc.lock.value) {
      throw new Error("Refund artifact does not contain mature median-time-past evidence");
    }
  }
}

function validateManifestShape(value: unknown): asserts value is UnsignedTransparentManifest {
  const manifest = recordValue(value, "Artifact manifest");
  exactKeys(manifest, [
    "schema",
    "boundary",
    "kind",
    "network",
    "profile",
    "targetHeight",
    "expiryHeight",
    "lockTime",
    "inputs",
    "outputs",
    "feeZatoshis",
    "policy",
    "authorization",
    "transactionIdState",
  ], "Artifact manifest");
  if (manifest.schema !== ZCASH_ARTIFACT_SCHEMA || manifest.boundary !== ZCASH_ARTIFACT_BOUNDARY) {
    throw new TypeError("Artifact schema or boundary is unsupported");
  }
  if (manifest.kind !== "fund" && manifest.kind !== "claim" && manifest.kind !== "refund") {
    throw new TypeError("Artifact kind is unsupported");
  }
  if (manifest.network !== "mainnet" && manifest.network !== "testnet") throw new TypeError("Artifact network is unsupported");

  const profile = recordValue(manifest.profile, "Artifact profile");
  exactKeys(profile, ["id", "transactionVersion", "versionGroupId", "consensusBranchId", "coinType"], "Artifact profile");
  if (profile.transactionVersion !== 5 && profile.transactionVersion !== 6) throw new TypeError("Artifact transaction version is unsupported");
  if (profile.id !== `zcash-${manifest.network}-nu6.3-v${profile.transactionVersion}`) {
    throw new TypeError("Artifact profile ID does not match its network, epoch, and transaction version");
  }
  const expectedVersionGroup = profile.transactionVersion === 5 ? "26a7270a" : "d884b698";
  if (profile.versionGroupId !== expectedVersionGroup) throw new TypeError("Artifact version group does not match its transaction version");
  if (profile.consensusBranchId !== "37a5165b") throw new TypeError("Artifact consensus branch is not NU6.3");
  const expectedCoinType = manifest.network === "mainnet" ? 133 : 1;
  if (manifestUint32(profile.coinType, "Artifact coin type") !== expectedCoinType) {
    throw new RangeError(`Artifact coin type must be ${expectedCoinType} for its network`);
  }

  const targetHeight = manifestUint32(manifest.targetHeight, "Artifact target height");
  const expiryHeight = manifestUint32(manifest.expiryHeight, "Artifact expiry height");
  const lockTime = manifestUint32(manifest.lockTime, "Artifact locktime");
  if (targetHeight >= 500_000_000 || expiryHeight >= 500_000_000) throw new RangeError("Artifact heights exceed the block-height range");
  const activationHeight = manifest.network === "mainnet" ? 3_428_143 : 4_134_000;
  if (targetHeight < activationHeight) throw new RangeError("Artifact target height precedes its NU6.3 network profile");
  if (expiryHeight !== 0 && expiryHeight < targetHeight) throw new RangeError("Artifact expiry is earlier than its target height");

  if (!Array.isArray(manifest.inputs) || manifest.inputs.length === 0 || manifest.inputs.length > 1_000) {
    throw new RangeError("Artifact inputs must contain between 1 and 1,000 entries");
  }
  const outpoints = new Set<string>();
  let inputTotal = 0n;
  for (const [index, inputValue] of manifest.inputs.entries()) {
    const input = recordValue(inputValue, `Artifact input ${index}`);
    exactKeys(input, ["txid", "outputIndex", "sequence", "valueZatoshis", "scriptPubKeyHex"], `Artifact input ${index}`);
    if (typeof input.txid !== "string" || !/^[0-9a-f]{64}$/.test(input.txid)) {
      throw new TypeError(`Artifact input ${index} transaction ID must be 32 lowercase hexadecimal bytes`);
    }
    const outputIndex = manifestUint32(input.outputIndex, `Artifact input ${index} output index`);
    const outpoint = `${input.txid}:${outputIndex}`;
    if (outpoints.has(outpoint)) throw new Error("Artifact contains a duplicate outpoint");
    outpoints.add(outpoint);
    const sequence = manifestUint32(input.sequence, `Artifact input ${index} sequence`);
    const expectedSequence = manifest.kind === "refund" ? 0xffff_fffe : 0xffff_ffff;
    if (sequence !== expectedSequence) throw new RangeError("Artifact input sequence does not match its kind");
    inputTotal += manifestZatoshis(input.valueZatoshis, `Artifact input ${index} value`);
    manifestHex(input.scriptPubKeyHex, `Artifact input ${index} scriptPubKey`);
  }

  if (!Array.isArray(manifest.outputs) || manifest.outputs.length === 0 || manifest.outputs.length > 1_000) {
    throw new RangeError("Artifact outputs must contain between 1 and 1,000 entries");
  }
  let outputTotal = 0n;
  for (const [index, outputValue] of manifest.outputs.entries()) {
    const output = recordValue(outputValue, `Artifact output ${index}`);
    exactKeys(output, ["role", "valueZatoshis", "scriptPubKeyHex"], `Artifact output ${index}`);
    if (output.role !== "contract" && output.role !== "recipient" && output.role !== "change") {
      throw new TypeError(`Artifact output ${index} role is unsupported`);
    }
    outputTotal += manifestZatoshis(output.valueZatoshis, `Artifact output ${index} value`);
    manifestHex(output.scriptPubKeyHex, `Artifact output ${index} scriptPubKey`);
  }
  if (manifest.kind === "fund") {
    if (lockTime !== 0 || manifest.outputs[0]?.role !== "contract" || manifest.outputs.length > 2
      || (manifest.outputs.length === 2 && manifest.outputs[1]?.role !== "change")) {
      throw new TypeError("Funding artifact locktime or output ordering is invalid");
    }
  } else if ((manifest.kind === "claim" && lockTime !== 0)
    || manifest.outputs.length !== 1 || manifest.outputs[0]?.role !== "recipient") {
    throw new TypeError("Spend artifact locktime or output ordering is invalid");
  }
  if (manifest.kind === "refund" && lockTime === 0) throw new RangeError("Refund artifact locktime must be non-zero");

  const fee = manifestZatoshis(manifest.feeZatoshis, "Artifact fee");
  if (inputTotal > 2_100_000_000_000_000n || outputTotal > 2_100_000_000_000_000n) {
    throw new RangeError("Artifact aggregate value exceeds the ZEC supply bound");
  }
  if (inputTotal !== outputTotal + fee) throw new RangeError("Artifact input value does not equal outputs plus fee");

  const policy = recordValue(manifest.policy, "Artifact construction policy");
  exactKeys(
    policy,
    ["feePolicy", "serializedTransactionSize", "relayability", "observedHeight", "refundMaturity"],
    "Artifact construction policy",
  );
  const feePolicy = recordValue(policy.feePolicy, "Artifact fee policy");
  exactKeys(feePolicy, [
    "id",
    "maximumFeeZatoshis",
    "minimumOutputZatoshis",
    "maximumSerializedTransactionBytes",
    "finalizedTransparentInputBytes",
    "finalizedTransparentOutputBytes",
    "conventionalFeeZatoshis",
  ], "Artifact fee policy");
  if (feePolicy.id !== "zip317-transparent-r0-r1") throw new TypeError("Artifact fee policy is unsupported");
  const maximumFee = manifestZatoshis(feePolicy.maximumFeeZatoshis, "Artifact maximum fee");
  const minimumOutput = manifestZatoshis(feePolicy.minimumOutputZatoshis, "Artifact minimum output");
  manifestPositiveSafeInteger(feePolicy.maximumSerializedTransactionBytes, "Artifact maximum serialized transaction bytes");
  const finalizedSize = {
    inputBytes: manifestPositiveSafeInteger(feePolicy.finalizedTransparentInputBytes, "Artifact transparent input bytes"),
    outputBytes: manifestPositiveSafeInteger(feePolicy.finalizedTransparentOutputBytes, "Artifact transparent output bytes"),
  };
  const conventionalFee = manifestZatoshis(feePolicy.conventionalFeeZatoshis, "Artifact conventional fee");
  if (conventionalFee !== zip317TransparentConventionalFee(finalizedSize)) {
    throw new RangeError("Artifact conventional fee does not match its finalized transparent byte counts");
  }
  if (fee < conventionalFee || fee > maximumFee) {
    throw new RangeError("Artifact fee is outside its committed conventional and maximum fee bounds");
  }
  if (manifest.outputs.some((output) => BigInt(output.valueZatoshis) < minimumOutput)) {
    throw new RangeError("Artifact output is below its committed minimum output");
  }

  const serializedSize = recordValue(policy.serializedTransactionSize, "Artifact serialized transaction size");
  exactKeys(serializedSize, ["state", "actualBytes", "reason"], "Artifact serialized transaction size");
  if (serializedSize.state !== "unresolved" || serializedSize.actualBytes !== null
    || serializedSize.reason !== ZCASH_SERIALIZED_SIZE_UNRESOLVED_REASON) {
    throw new TypeError("Artifact serialized transaction size must remain explicitly unresolved");
  }
  if (policy.relayability !== ZCASH_RELAYABILITY_UNRESOLVED) {
    throw new TypeError("Artifact relayability must remain explicitly unresolved");
  }
  let observedHeight: number | null = null;
  if (policy.observedHeight !== null) {
    observedHeight = manifestUint32(policy.observedHeight, "Artifact observed height");
    if (observedHeight < activationHeight || observedHeight >= 500_000_000) {
      throw new RangeError("Artifact observed height is outside its network profile");
    }
    if (expiryHeight !== 0 && observedHeight > expiryHeight) throw new RangeError("Artifact is expired at its observed height");
  }
  if (manifest.kind === "fund") {
    if (observedHeight !== null || policy.refundMaturity !== null) {
      throw new TypeError("Funding artifact must not contain spend observation evidence");
    }
  } else if (observedHeight === null) {
    throw new TypeError("Spend artifact must commit its observed height");
  }
  if (manifest.kind === "refund") {
    const maturity = recordValue(policy.refundMaturity, "Artifact refund maturity evidence");
    exactKeys(maturity, ["lockType", "currentBlockHeight", "medianTimePast"], "Artifact refund maturity evidence");
    if (maturity.lockType !== "height" && maturity.lockType !== "timestamp") {
      throw new TypeError("Artifact refund maturity lock type is unsupported");
    }
    if (manifestUint32(maturity.currentBlockHeight, "Artifact refund maturity height") !== observedHeight) {
      throw new Error("Artifact refund maturity height does not match its observed height");
    }
    if (maturity.medianTimePast !== null) manifestUint32(maturity.medianTimePast, "Artifact refund median-time-past");
  } else if (policy.refundMaturity !== null) {
    throw new TypeError("Only refund artifacts may contain maturity evidence");
  }

  const authorization = recordValue(manifest.authorization, "Artifact authorization");
  allowedKeys(
    authorization,
    ["sighashType", "sighashCode", "txModifiable", "branch", "redeemScriptHex"],
    ["preimageHex", "refundSafetyMargin", "fundingLockCutoff"],
    "Artifact authorization",
  );
  if (authorization.sighashType !== "SIGHASH_ALL" || authorization.sighashCode !== 1 || authorization.txModifiable !== 0) {
    throw new TypeError("Artifact authorization must freeze SIGHASH_ALL with no transaction modifications");
  }
  if (authorization.branch !== manifest.kind) throw new TypeError("Artifact authorization branch does not match its kind");
  manifestHex(authorization.redeemScriptHex, "Artifact redeemScript");
  if (manifest.kind === "claim") {
    manifestHex(authorization.preimageHex, "Artifact claim preimage", 32);
    if (authorization.refundSafetyMargin !== undefined || authorization.fundingLockCutoff !== undefined) {
      throw new TypeError("Claim artifact contains funding-only policy fields");
    }
  } else if (manifest.kind === "refund") {
    if (authorization.preimageHex !== undefined || authorization.refundSafetyMargin !== undefined
      || authorization.fundingLockCutoff !== undefined) {
      throw new TypeError("Refund artifact contains claim or funding-only policy fields");
    }
  } else if (authorization.refundSafetyMargin === undefined || authorization.fundingLockCutoff === undefined) {
    throw new TypeError("Funding artifact must commit its refund safety policy");
  }
  if (manifest.kind === "fund") {
    const margin = recordValue(authorization.refundSafetyMargin, "Funding artifact refund safety margin");
    exactKeys(margin, ["type", "value"], "Funding artifact refund safety margin");
  }
  if (manifest.transactionIdState !== "unresolved-until-canonical-transaction-extraction") {
    throw new TypeError("Artifact transaction ID state is unsupported");
  }
  validateArtifactSemantics(manifest as unknown as UnsignedTransparentManifest);
}

function shapeGuard(value: unknown): asserts value is CommittedZcashArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Artifact envelope must be an object");
  const envelope = value as Record<string, unknown>;
  if (Object.keys(envelope).sort().join(",") !== "manifest,manifestDigest") {
    throw new TypeError("Artifact envelope contains unexpected fields");
  }
  if (typeof envelope.manifestDigest !== "string" || !/^[0-9a-f]{64}$/.test(envelope.manifestDigest)) {
    throw new TypeError("Artifact manifest digest must be 32 lowercase hexadecimal bytes");
  }
  validateManifestShape(envelope.manifest);
}

export function commitZcashArtifact(manifest: UnsignedTransparentManifest): CommittedZcashArtifact {
  validateManifestShape(manifest);
  const manifestJson = canonicalize(manifest, "artifact.manifest");
  const cloned = JSON.parse(manifestJson) as UnsignedTransparentManifest;
  return deepFreeze({ manifest: cloned, manifestDigest: sha256Hex(manifestJson) });
}

export function verifyZcashArtifact(artifact: CommittedZcashArtifact): void {
  shapeGuard(artifact);
  const expected = sha256Hex(canonicalize(artifact.manifest, "artifact.manifest"));
  if (artifact.manifestDigest !== expected) throw new Error("Artifact manifest digest does not match its contents");
}

export function serializeZcashArtifact(artifact: CommittedZcashArtifact): string {
  verifyZcashArtifact(artifact);
  return canonicalize(artifact, "artifact");
}

export function parseZcashArtifact(serialized: string): CommittedZcashArtifact {
  const parsed = parseCanonicalJson(serialized);
  shapeGuard(parsed);
  verifyZcashArtifact(parsed);
  return deepFreeze(parsed);
}
