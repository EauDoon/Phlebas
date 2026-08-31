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

function shapeGuard(value: unknown): asserts value is CommittedZcashArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Artifact envelope must be an object");
  const envelope = value as Record<string, unknown>;
  if (Object.keys(envelope).sort().join(",") !== "manifest,manifestDigest") {
    throw new TypeError("Artifact envelope contains unexpected fields");
  }
  if (typeof envelope.manifestDigest !== "string" || !/^[0-9a-f]{64}$/.test(envelope.manifestDigest)) {
    throw new TypeError("Artifact manifest digest must be 32 lowercase hexadecimal bytes");
  }
  if (!envelope.manifest || typeof envelope.manifest !== "object" || Array.isArray(envelope.manifest)) {
    throw new TypeError("Artifact manifest must be an object");
  }
  const manifest = envelope.manifest as Record<string, unknown>;
  if (manifest.schema !== ZCASH_ARTIFACT_SCHEMA || manifest.boundary !== ZCASH_ARTIFACT_BOUNDARY) {
    throw new TypeError("Artifact schema or boundary is unsupported");
  }
}

export function commitZcashArtifact(manifest: UnsignedTransparentManifest): CommittedZcashArtifact {
  if (manifest.schema !== ZCASH_ARTIFACT_SCHEMA || manifest.boundary !== ZCASH_ARTIFACT_BOUNDARY) {
    throw new TypeError("Artifact schema or boundary is unsupported");
  }
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
