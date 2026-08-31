import { createHash } from "node:crypto";

import type { ZcashNetwork } from "./zcash-transparent.ts";

export const ZCASH_ARTIFACT_SCHEMA = "phlebas-zcash-transparent-artifact-v1";
export const ZCASH_ARTIFACT_BOUNDARY = "candidate-unsigned-effecting-data-manifest";

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
  authorization: Readonly<{
    sighashType: "SIGHASH_ALL";
    sighashCode: 1;
    txModifiable: 0;
    branch: "fund" | "claim" | "refund";
    redeemScriptHex?: string;
    preimageHex?: string;
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
  manifestUint32(profile.coinType, "Artifact coin type");

  const targetHeight = manifestUint32(manifest.targetHeight, "Artifact target height");
  const expiryHeight = manifestUint32(manifest.expiryHeight, "Artifact expiry height");
  const lockTime = manifestUint32(manifest.lockTime, "Artifact locktime");
  if (targetHeight >= 500_000_000 || expiryHeight >= 500_000_000) throw new RangeError("Artifact heights exceed the block-height range");
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

  const authorization = recordValue(manifest.authorization, "Artifact authorization");
  allowedKeys(
    authorization,
    ["sighashType", "sighashCode", "txModifiable", "branch", "redeemScriptHex"],
    ["preimageHex"],
    "Artifact authorization",
  );
  if (authorization.sighashType !== "SIGHASH_ALL" || authorization.sighashCode !== 1 || authorization.txModifiable !== 0) {
    throw new TypeError("Artifact authorization must freeze SIGHASH_ALL with no transaction modifications");
  }
  if (authorization.branch !== manifest.kind) throw new TypeError("Artifact authorization branch does not match its kind");
  manifestHex(authorization.redeemScriptHex, "Artifact redeemScript");
  if (manifest.kind === "claim") manifestHex(authorization.preimageHex, "Artifact claim preimage", 32);
  else if (authorization.preimageHex !== undefined) throw new TypeError("Only claim artifacts may contain a preimage");
  if (manifest.transactionIdState !== "unresolved-until-canonical-transaction-extraction") {
    throw new TypeError("Artifact transaction ID state is unsupported");
  }
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
