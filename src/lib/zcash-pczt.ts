import { createHash } from "node:crypto";

import {
  parseZcashArtifact,
  serializeZcashArtifact,
  type CommittedZcashArtifact,
  type UnsignedTransparentManifest,
} from "./zcash-artifact.ts";
import { evaluateExpiry } from "./zcash-transaction-policy.ts";

/**
 * This module deliberately validates only the PCZT magic/version envelope.
 * It does not parse or verify the full ZIP 374 positional payload.
 */
export const PCZT_ENVELOPE_SCHEMA = "phlebas-zcash-pczt-envelope-v1" as const;
export const PCZT_MAGIC = "PCZT" as const;
export const PCZT_HEADER_BYTES = 8;
export const PCZT_HEADER_VALIDATION = "header-only-not-full-zip374-verification" as const;

export const SUPPORTED_PCZT_VERSIONS = Object.freeze([1, 2] as const);
export type PcztVersion = (typeof SUPPORTED_PCZT_VERSIONS)[number];

export type PcztEnvelope = Readonly<{
  schema: typeof PCZT_ENVELOPE_SCHEMA;
  validation: typeof PCZT_HEADER_VALIDATION;
  pcztBase64: string;
  version: PcztVersion;
  byteSha256: string;
}>;

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

function canonicalizeJson(value: unknown, path: string): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new TypeError(`${path} must contain only safe integer numbers`);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((entry, index) => canonicalizeJson(entry, `${path}[${index}]`)).join(",")}]`;
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
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalizeJson(record[key], `${path}.${key}`)}`).join(",")}}`;
  }
  throw new TypeError(`${path} contains a non-JSON value`);
}

function parseCanonicalJson(serialized: string, label: string): JsonValue {
  if (typeof serialized !== "string" || serialized.length === 0 || serialized.trim() !== serialized) {
    throw new TypeError(`${label} must be canonical JSON without surrounding whitespace`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new TypeError(`${label} is not valid JSON`);
  }
  if (canonicalizeJson(parsed, label) !== serialized) throw new TypeError(`${label} is not canonical JSON`);
  return parsed as JsonValue;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    Object.freeze(value);
    for (const nested of Object.values(value)) deepFreeze(nested);
  }
  return value;
}

function sha256Bytes(bytes: Uint8Array): string {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("PCZT bytes must be a Uint8Array");
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

/** Return the SHA-256 digest of the complete PCZT byte sequence. */
export function pcztByteSha256(bytes: Uint8Array): string {
  return sha256Bytes(bytes);
}

const CANONICAL_BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeCanonicalBase64(value: unknown): Uint8Array {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError("PCZT base64 must be a non-empty canonical string");
  }
  if (value.length % 4 !== 0 || !CANONICAL_BASE64.test(value)) {
    throw new TypeError("PCZT base64 must use canonical standard Base64 encoding");
  }
  const decoded = Uint8Array.from(Buffer.from(value, "base64"));
  if (decoded.length === 0 || Buffer.from(decoded).toString("base64") !== value) {
    throw new TypeError("PCZT base64 is not canonical");
  }
  return decoded;
}

function versionFromHeader(bytes: Uint8Array): PcztVersion {
  if (bytes.length < PCZT_HEADER_BYTES) throw new RangeError("PCZT envelope is shorter than its 8-byte header");
  const magic = String.fromCharCode(...bytes.slice(0, 4));
  if (magic !== PCZT_MAGIC) throw new TypeError("PCZT envelope has an unknown magic header");
  const versionNumber = bytes[4] + (bytes[5] * 0x100) + (bytes[6] * 0x10000) + (bytes[7] * 0x1000000);
  if (versionNumber !== 1 && versionNumber !== 2) {
    throw new RangeError(`PCZT envelope version ${versionNumber} is unsupported`);
  }
  return versionNumber;
}

function envelopeFromBase64(pcztBase64: string): PcztEnvelope {
  const bytes = decodeCanonicalBase64(pcztBase64);
  if (bytes.length <= PCZT_HEADER_BYTES) throw new RangeError("PCZT envelope payload must not be empty");
  const version = versionFromHeader(bytes);
  return Object.freeze({
    schema: PCZT_ENVELOPE_SCHEMA,
    validation: PCZT_HEADER_VALIDATION,
    pcztBase64,
    version,
    byteSha256: sha256Bytes(bytes),
  });
}

/**
 * Parse a canonical Base64 PCZT envelope. The returned validation scope is
 * header-only: ZIP 374 payload fields, proofs, and signatures are not checked.
 */
export function parsePcztEnvelope(pcztBase64: string): PcztEnvelope {
  return envelopeFromBase64(pcztBase64);
}

/** Build a canonical envelope from bytes after applying header-only checks. */
export function createPcztEnvelope(bytes: Uint8Array): PcztEnvelope {
  if (!(bytes instanceof Uint8Array)) throw new TypeError("PCZT bytes must be a Uint8Array");
  return envelopeFromBase64(Buffer.from(bytes).toString("base64"));
}

/** Encode bytes as canonical Base64 after applying header-only checks. */
export function encodePcztEnvelope(bytes: Uint8Array): string {
  return createPcztEnvelope(bytes).pcztBase64;
}

function envelopeShapeGuard(value: unknown): asserts value is PcztEnvelope {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("PCZT envelope must be an object");
  }
  const record = value as Record<string, unknown>;
  if (Object.keys(record).sort().join(",") !== "byteSha256,pcztBase64,schema,validation,version") {
    throw new TypeError("PCZT envelope contains unexpected fields");
  }
  if (record.schema !== PCZT_ENVELOPE_SCHEMA || record.validation !== PCZT_HEADER_VALIDATION) {
    throw new TypeError("PCZT envelope schema or validation scope is unsupported");
  }
  if (typeof record.byteSha256 !== "string" || !/^[0-9a-f]{64}$/.test(record.byteSha256)) {
    throw new TypeError("PCZT envelope byte SHA-256 must be 32 lowercase hexadecimal bytes");
  }
  if (typeof record.pcztBase64 !== "string") throw new TypeError("PCZT envelope Base64 is required");
  if (record.version !== 1 && record.version !== 2) throw new TypeError("PCZT envelope version is unsupported");
}

function normalizePcztEnvelope(value: PcztEnvelope | string): PcztEnvelope {
  const parsed = typeof value === "string" ? envelopeFromBase64(value) : (() => {
    envelopeShapeGuard(value);
    return envelopeFromBase64(value.pcztBase64);
  })();
  if (typeof value !== "string") {
    if (value.schema !== parsed.schema || value.validation !== parsed.validation) {
      throw new Error("PCZT envelope metadata does not match its bytes");
    }
    if (value.version !== parsed.version || value.byteSha256 !== parsed.byteSha256) {
      throw new Error("PCZT envelope version or byte digest does not match its bytes");
    }
  }
  return parsed;
}

/** Verify an envelope object and its advertised header/digest. */
export function verifyPcztEnvelope(value: PcztEnvelope): void {
  normalizePcztEnvelope(value);
}

/** Re-serialize an envelope only if its advertised fields match its bytes. */
export function serializePcztEnvelope(value: PcztEnvelope | string): string {
  return normalizePcztEnvelope(value).pcztBase64;
}

/** Return a defensive copy of the exact bytes represented by an envelope. */
export function pcztEnvelopeBytes(value: PcztEnvelope | string): Uint8Array {
  return Uint8Array.from(decodeCanonicalBase64(normalizePcztEnvelope(value).pcztBase64));
}

export const parseZcashPcztEnvelope = parsePcztEnvelope;
export const createZcashPcztEnvelope = createPcztEnvelope;

export const WALLET_REVIEW_REQUEST_SCHEMA = "phlebas-zcash-wallet-review-request-v1" as const;

const V5_PCZT_VERSIONS = Object.freeze([1, 2] as const);
const V6_PCZT_VERSIONS = Object.freeze([2] as const);

export type WalletReviewRequest = Readonly<{
  schema: typeof WALLET_REVIEW_REQUEST_SCHEMA;
  validation: typeof PCZT_HEADER_VALIDATION;
  pcztBase64: string;
  pcztByteSha256: string;
  pcztVersion: PcztVersion;
  expectedPcztVersions: readonly PcztVersion[];
  manifestDigest: string;
  manifest: UnsignedTransparentManifest;
  txModifiable: 0;
  sighashType: "SIGHASH_ALL";
  sighashCode: 1;
}>;

function transactionVersion(value: unknown): 5 | 6 {
  if (value !== 5 && value !== 6) throw new RangeError("Wallet review manifest transaction version must be 5 or 6");
  return value;
}

export function expectedPcztVersionsForTransaction(transaction: 5 | 6): readonly PcztVersion[] {
  if (transaction === 5) return V5_PCZT_VERSIONS;
  if (transaction === 6) return V6_PCZT_VERSIONS;
  throw new RangeError("PCZT version policy supports only transaction versions 5 and 6");
}

function ensureReviewManifest(manifest: UnsignedTransparentManifest): void {
  const version = transactionVersion(manifest.profile?.transactionVersion);
  const authorization = manifest.authorization;
  if (!authorization || typeof authorization !== "object") throw new TypeError("Wallet review manifest authorization is required");
  if (authorization.txModifiable !== 0) throw new Error("Wallet review requires txModifiable=0");
  if (authorization.sighashType !== "SIGHASH_ALL" || authorization.sighashCode !== 1) {
    throw new Error("Wallet review requires SIGHASH_ALL with sighash code 1");
  }
  if (version === 6 && expectedPcztVersionsForTransaction(version).length !== 1) {
    throw new Error("Transaction version 6 must use PCZT version 2");
  }
}

function cloneArtifact(value: CommittedZcashArtifact | string): CommittedZcashArtifact {
  return typeof value === "string" ? parseZcashArtifact(value) : parseZcashArtifact(serializeZcashArtifact(value));
}

function requireApprovedManifestDigest(approved: unknown, actual: string): void {
  if (typeof approved !== "string" || !/^[0-9a-f]{64}$/.test(approved)) {
    throw new TypeError("Approved manifest digest must be 32 lowercase hexadecimal bytes");
  }
  if (approved !== actual) {
    throw new Error("Wallet artifact does not match the independently approved manifest digest");
  }
}

function reviewRequestShapeGuard(value: unknown): asserts value is WalletReviewRequest {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Wallet review request must be an object");
  const record = value as Record<string, unknown>;
  const expectedKeys = "expectedPcztVersions,manifest,manifestDigest,pcztBase64,pcztByteSha256,pcztVersion,schema,sighashCode,sighashType,txModifiable,validation";
  if (Object.keys(record).sort().join(",") !== expectedKeys) throw new TypeError("Wallet review request contains unexpected fields");
  if (record.schema !== WALLET_REVIEW_REQUEST_SCHEMA || record.validation !== PCZT_HEADER_VALIDATION) {
    throw new TypeError("Wallet review request schema or validation scope is unsupported");
  }
  if (typeof record.manifestDigest !== "string" || !/^[0-9a-f]{64}$/.test(record.manifestDigest)) {
    throw new TypeError("Wallet review manifest digest must be 32 lowercase hexadecimal bytes");
  }
  if (typeof record.pcztBase64 !== "string" || typeof record.pcztByteSha256 !== "string") {
    throw new TypeError("Wallet review PCZT bytes and digest are required");
  }
  if (!Array.isArray(record.expectedPcztVersions) || !record.expectedPcztVersions.every((version) => version === 1 || version === 2)) {
    throw new TypeError("Wallet review expected PCZT versions are invalid");
  }
  if (record.txModifiable !== 0 || record.sighashType !== "SIGHASH_ALL" || record.sighashCode !== 1) {
    throw new Error("Wallet review authorization fields are not fixed to txModifiable=0 and SIGHASH_ALL");
  }
}

function verifyWalletReviewRequestValue(value: WalletReviewRequest): void {
  reviewRequestShapeGuard(value);
  const envelope = envelopeFromBase64(value.pcztBase64);
  if (value.pcztByteSha256 !== envelope.byteSha256 || value.pcztVersion !== envelope.version) {
    throw new Error("Wallet review PCZT envelope fields do not match its bytes");
  }
  const artifact = parseZcashArtifact(canonicalizeJson({
    manifest: value.manifest,
    manifestDigest: value.manifestDigest,
  }, "wallet review artifact"));
  ensureReviewManifest(artifact.manifest);
  const expected = expectedPcztVersionsForTransaction(artifact.manifest.profile.transactionVersion);
  if (value.expectedPcztVersions.length !== expected.length || value.expectedPcztVersions.some((version, index) => version !== expected[index])) {
    throw new Error("Wallet review expected PCZT versions do not match the transaction version");
  }
  if (!expected.includes(envelope.version)) {
    throw new Error(`PCZT version ${envelope.version} is not permitted for transaction version ${artifact.manifest.profile.transactionVersion}`);
  }
}

/**
 * Create an immutable review request that binds the exact committed manifest
 * and the exact header-checked PCZT bytes.
 */
export function createWalletReviewRequest(options: {
  artifact: CommittedZcashArtifact | string;
  pczt: PcztEnvelope | string;
  approvedManifestDigest: string;
}): WalletReviewRequest;
export function createWalletReviewRequest(options: {
  artifact: CommittedZcashArtifact | string;
  pczt: PcztEnvelope | string;
  approvedManifestDigest: string;
}): WalletReviewRequest {
  const artifact = cloneArtifact(options.artifact);
  requireApprovedManifestDigest(options.approvedManifestDigest, artifact.manifestDigest);
  ensureReviewManifest(artifact.manifest);
  const envelope = normalizePcztEnvelope(options.pczt);
  const expected = expectedPcztVersionsForTransaction(artifact.manifest.profile.transactionVersion);
  if (!expected.includes(envelope.version)) {
    throw new Error(`PCZT version ${envelope.version} is not permitted for transaction version ${artifact.manifest.profile.transactionVersion}`);
  }
  const request = {
    schema: WALLET_REVIEW_REQUEST_SCHEMA,
    validation: PCZT_HEADER_VALIDATION,
    pcztBase64: envelope.pcztBase64,
    pcztByteSha256: envelope.byteSha256,
    pcztVersion: envelope.version,
    expectedPcztVersions: expected,
    manifestDigest: artifact.manifestDigest,
    manifest: artifact.manifest,
    txModifiable: 0 as const,
    sighashType: "SIGHASH_ALL" as const,
    sighashCode: 1 as const,
  } satisfies WalletReviewRequest;
  verifyWalletReviewRequestValue(request);
  return deepFreeze(request);
}

export function verifyWalletReviewRequest(value: WalletReviewRequest, approvedManifestDigest: string): void {
  verifyWalletReviewRequestValue(value);
  requireApprovedManifestDigest(approvedManifestDigest, value.manifestDigest);
}

export function serializeWalletReviewRequest(value: WalletReviewRequest, approvedManifestDigest: string): string {
  verifyWalletReviewRequest(value, approvedManifestDigest);
  return canonicalizeJson(value, "wallet review request");
}

export function parseWalletReviewRequest(
  serialized: string,
  options: { approvedManifestDigest: string },
): WalletReviewRequest {
  const parsed = parseCanonicalJson(serialized, "Wallet review request");
  reviewRequestShapeGuard(parsed);
  verifyWalletReviewRequest(parsed, options.approvedManifestDigest);
  return deepFreeze(parsed);
}

export const createZcashWalletReviewRequest = createWalletReviewRequest;

export const WALLET_INSPECTION_SCHEMA = "phlebas-zcash-wallet-inspection-v1" as const;

export type WalletPcztInspection = Readonly<{
  schema: typeof WALLET_INSPECTION_SCHEMA;
  validation: typeof PCZT_HEADER_VALIDATION;
  pcztBase64: string;
  pcztByteSha256: string;
  pcztVersion: PcztVersion;
  expectedPcztVersions: readonly PcztVersion[];
  manifestDigest: string;
  manifest: UnsignedTransparentManifest;
  txModifiable: 0;
  sighashType: "SIGHASH_ALL";
  sighashCode: 1;
}>;

function expectedWalletInspection(request: WalletReviewRequest): WalletPcztInspection {
  return {
    schema: WALLET_INSPECTION_SCHEMA,
    validation: PCZT_HEADER_VALIDATION,
    pcztBase64: request.pcztBase64,
    pcztByteSha256: request.pcztByteSha256,
    pcztVersion: request.pcztVersion,
    expectedPcztVersions: request.expectedPcztVersions,
    manifestDigest: request.manifestDigest,
    manifest: request.manifest,
    txModifiable: 0,
    sighashType: "SIGHASH_ALL",
    sighashCode: 1,
  };
}

function inspectionShapeGuard(value: unknown): asserts value is WalletPcztInspection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Wallet PCZT inspection must be an object");
  const record = value as Record<string, unknown>;
  const expectedKeys = "expectedPcztVersions,manifest,manifestDigest,pcztBase64,pcztByteSha256,pcztVersion,schema,sighashCode,sighashType,txModifiable,validation";
  if (Object.keys(record).sort().join(",") !== expectedKeys) throw new TypeError("Wallet PCZT inspection contains unexpected fields");
  if (record.schema !== WALLET_INSPECTION_SCHEMA || record.validation !== PCZT_HEADER_VALIDATION) {
    throw new TypeError("Wallet PCZT inspection schema or validation scope is unsupported");
  }
}

function normalizeInspection(value: WalletPcztInspection | string): WalletPcztInspection {
  const parsed = typeof value === "string" ? parseCanonicalJson(value, "Wallet PCZT inspection") : value;
  inspectionShapeGuard(parsed);
  const canonical = canonicalizeJson(parsed, "wallet PCZT inspection");
  const normalized = JSON.parse(canonical) as WalletPcztInspection;
  inspectionShapeGuard(normalized);
  return deepFreeze(normalized);
}

/** Build the exact inspection record a conforming adapter must return. */
export function expectedWalletPcztInspection(
  value: WalletReviewRequest | string,
  approvedManifestDigest: string,
): WalletPcztInspection {
  const request = typeof value === "string"
    ? parseWalletReviewRequest(value, { approvedManifestDigest })
    : value;
  verifyWalletReviewRequest(request, approvedManifestDigest);
  return deepFreeze(expectedWalletInspection(request));
}

/**
 * Verify every inspection field against the review request. Inspection is
 * deliberately strict so a wallet cannot substitute outputs or manifest data.
 */
export function verifyWalletPcztInspection(
  requestValue: WalletReviewRequest | string,
  inspectionValue: WalletPcztInspection | string,
  approvedManifestDigest: string,
): void {
  const request = typeof requestValue === "string"
    ? parseWalletReviewRequest(requestValue, { approvedManifestDigest })
    : requestValue;
  verifyWalletReviewRequest(request, approvedManifestDigest);
  const inspection = normalizeInspection(inspectionValue);
  const expected = expectedWalletInspection(request);
  if (canonicalizeJson(inspection, "wallet PCZT inspection") !== canonicalizeJson(expected, "expected wallet PCZT inspection")) {
    throw new Error("Wallet PCZT inspection does not exactly match the review request");
  }
  const envelope = envelopeFromBase64(inspection.pcztBase64);
  if (envelope.byteSha256 !== request.pcztByteSha256 || envelope.version !== request.pcztVersion) {
    throw new Error("Wallet PCZT inspection envelope digest or version conflicts with the request");
  }
}

export function serializeWalletPcztInspection(value: WalletPcztInspection): string {
  inspectionShapeGuard(value);
  return canonicalizeJson(value, "wallet PCZT inspection");
}

export const verifyWalletInspection = verifyWalletPcztInspection;
export const expectedWalletInspectionRecord = expectedWalletPcztInspection;

export type WalletPcztCapabilityState = "proven" | "unproven" | "unsupported";
export type WalletPcztCapability =
  | "customTransparentInputs"
  | "customP2shScripts"
  | "exactLockTime"
  | "exactExpiry"
  | "exactOutputs";

export const REQUIRED_WALLET_PCZT_CAPABILITIES = Object.freeze([
  "customTransparentInputs",
  "customP2shScripts",
  "exactLockTime",
  "exactExpiry",
  "exactOutputs",
] as const);

export type WalletPcztCapabilities = Readonly<Record<WalletPcztCapability, WalletPcztCapabilityState>>;

export type WalletPcztReadiness = Readonly<{
  ready: boolean;
  required: readonly WalletPcztCapability[];
  missing: readonly WalletPcztCapability[];
  unproven: readonly WalletPcztCapability[];
  unsupported: readonly WalletPcztCapability[];
}>;

function capabilityList(value: readonly WalletPcztCapability[] = REQUIRED_WALLET_PCZT_CAPABILITIES): readonly WalletPcztCapability[] {
  if (!Array.isArray(value) || value.some((entry) => !REQUIRED_WALLET_PCZT_CAPABILITIES.includes(entry))) {
    throw new TypeError("Wallet PCZT required capabilities contain an unknown capability");
  }
  const unique = [...new Set(value)];
  if (unique.length !== value.length) throw new TypeError("Wallet PCZT required capabilities contain duplicates");
  return Object.freeze(unique);
}

function capabilityRecord(value: WalletPcztCapabilities | Partial<WalletPcztCapabilities>): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Wallet PCZT capabilities must be an object");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (!REQUIRED_WALLET_PCZT_CAPABILITIES.includes(key as WalletPcztCapability)) {
      throw new TypeError(`Wallet PCZT capabilities contain unknown field ${key}`);
    }
  }
  return record;
}

/** Assess readiness; absent capabilities are treated as unproven. */
export function walletPcztReadiness(
  value: WalletPcztCapabilities | Partial<WalletPcztCapabilities> | WalletPcztAdapter,
  required: readonly WalletPcztCapability[] = REQUIRED_WALLET_PCZT_CAPABILITIES,
): WalletPcztReadiness {
  const capabilities = "capabilities" in value ? value.capabilities : value;
  const record = capabilityRecord(capabilities);
  const requiredList = capabilityList(required);
  const missing: WalletPcztCapability[] = [];
  const unproven: WalletPcztCapability[] = [];
  const unsupported: WalletPcztCapability[] = [];
  for (const key of requiredList) {
    const state = record[key];
    if (state === undefined) missing.push(key);
    else if (state === "unproven") unproven.push(key);
    else if (state === "unsupported") unsupported.push(key);
    else if (state !== "proven") throw new TypeError(`Wallet PCZT capability ${key} has an invalid state`);
  }
  return Object.freeze({
    ready: missing.length === 0 && unproven.length === 0 && unsupported.length === 0,
    required: requiredList,
    missing: Object.freeze(missing),
    unproven: Object.freeze(unproven),
    unsupported: Object.freeze(unsupported),
  });
}

/** Fail closed unless every required custom transaction capability is proven. */
export function assertWalletPcztReady(
  value: WalletPcztCapabilities | Partial<WalletPcztCapabilities> | WalletPcztAdapter,
  required?: readonly WalletPcztCapability[],
): WalletPcztReadiness {
  const readiness = walletPcztReadiness(value, required);
  if (!readiness.ready) {
    const failures = [
      ...readiness.missing.map((key) => `${key}=missing`),
      ...readiness.unproven.map((key) => `${key}=unproven`),
      ...readiness.unsupported.map((key) => `${key}=unsupported`),
    ];
    throw new Error(`Wallet PCZT adapter is not ready: ${failures.join(", ")}`);
  }
  return readiness;
}

/**
 * Candidate adapter surface. Every transport value is an opaque string. No
 * method accepts seed, spending-key, viewing-key, or signature bytes.
 */
export interface WalletPcztAdapter {
  readonly capabilities: WalletPcztCapabilities;
  createPczt(artifact: string): Promise<string>;
  inspectPczt(request: string): Promise<string>;
  signPczt(request: string): Promise<string>;
  combinePczt?(requests: readonly string[]): Promise<string>;
  extractPczt?(request: string): Promise<string>;
}

export const WALLET_PCZT_SNAPSHOT_SCHEMA = "phlebas-zcash-wallet-pczt-restart-v1" as const;

export type WalletPcztLifecycle =
  | "created"
  | "review-requested"
  | "inspected"
  | "signed"
  | "extracted"
  | "failed"
  | "expired";

const WALLET_PCZT_LIFECYCLES = Object.freeze([
  "created",
  "review-requested",
  "inspected",
  "signed",
  "extracted",
  "failed",
  "expired",
] as const);

export type WalletPcztRestartSnapshot = Readonly<{
  schema: typeof WALLET_PCZT_SNAPSHOT_SCHEMA;
  artifact: CommittedZcashArtifact;
  pcztBase64: string;
  pcztByteSha256: string;
  pcztVersion: PcztVersion;
  lifecycle: WalletPcztLifecycle;
  observedHeight: number | null;
  checksum: string;
}>;

function observedHeight(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0 || value > 499_999_999) {
    throw new RangeError("Wallet PCZT observed height must be from 0 through 499999999");
  }
  return value;
}

function lifecycle(value: unknown): WalletPcztLifecycle {
  if (!WALLET_PCZT_LIFECYCLES.includes(value as WalletPcztLifecycle)) {
    throw new TypeError("Wallet PCZT restart snapshot lifecycle is unknown");
  }
  return value as WalletPcztLifecycle;
}

function snapshotPayload(value: Omit<WalletPcztRestartSnapshot, "checksum">): JsonValue {
  return value as unknown as JsonValue;
}

function snapshotShapeGuard(value: unknown): asserts value is WalletPcztRestartSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new TypeError("Wallet PCZT restart snapshot must be an object");
  const record = value as Record<string, unknown>;
  const expectedKeys = "artifact,checksum,lifecycle,observedHeight,pcztBase64,pcztByteSha256,pcztVersion,schema";
  if (Object.keys(record).sort().join(",") !== expectedKeys) throw new TypeError("Wallet PCZT restart snapshot contains unexpected fields");
  if (record.schema !== WALLET_PCZT_SNAPSHOT_SCHEMA) throw new TypeError("Wallet PCZT restart snapshot schema is unsupported");
  if (typeof record.checksum !== "string" || !/^[0-9a-f]{64}$/.test(record.checksum)) {
    throw new TypeError("Wallet PCZT restart snapshot checksum must be 32 lowercase hexadecimal bytes");
  }
  lifecycle(record.lifecycle);
  observedHeight(record.observedHeight);
}

function expiryForSnapshot(artifact: CommittedZcashArtifact, height: number | null): void {
  const assessment = evaluateExpiry(artifact.manifest.expiryHeight, height ?? undefined);
  if (assessment.state === "expired") throw new Error("Wallet PCZT restart snapshot is expired");
}

function verifyWalletPcztRestartSnapshotValue(
  value: WalletPcztRestartSnapshot,
  approvedManifestDigest: string,
  currentHeight?: number,
): void {
  snapshotShapeGuard(value);
  const artifact = cloneArtifact(value.artifact);
  requireApprovedManifestDigest(approvedManifestDigest, artifact.manifestDigest);
  const envelope = envelopeFromBase64(value.pcztBase64);
  const request = createWalletReviewRequest({
    artifact,
    pczt: envelope,
    approvedManifestDigest,
  });
  if (value.pcztByteSha256 !== envelope.byteSha256 || value.pcztVersion !== envelope.version) {
    throw new Error("Wallet PCZT restart snapshot PCZT digest or version does not match its bytes");
  }
  if (canonicalizeJson(value.artifact, "wallet PCZT snapshot artifact") !== canonicalizeJson(artifact, "canonical wallet PCZT snapshot artifact")) {
    throw new Error("Wallet PCZT restart snapshot artifact is not canonical");
  }
  const payload = {
    schema: WALLET_PCZT_SNAPSHOT_SCHEMA,
    artifact,
    pcztBase64: request.pcztBase64,
    pcztByteSha256: request.pcztByteSha256,
    pcztVersion: request.pcztVersion,
    lifecycle: value.lifecycle,
    observedHeight: observedHeight(value.observedHeight),
  } satisfies Omit<WalletPcztRestartSnapshot, "checksum">;
  const expectedChecksum = sha256Bytes(Buffer.from(canonicalizeJson(snapshotPayload(payload), "wallet PCZT restart snapshot"), "utf8"));
  if (value.checksum !== expectedChecksum) throw new Error("Wallet PCZT restart snapshot checksum does not match its contents");
  expiryForSnapshot(artifact, payload.observedHeight);
  if (currentHeight !== undefined) expiryForSnapshot(artifact, observedHeight(currentHeight));
}

export function createWalletPcztRestartSnapshot(options: {
  artifact: CommittedZcashArtifact | string;
  pczt: PcztEnvelope | string;
  approvedManifestDigest: string;
  lifecycle: WalletPcztLifecycle;
  observedHeight?: number;
}): WalletPcztRestartSnapshot {
  const artifact = cloneArtifact(options.artifact);
  const envelope = normalizePcztEnvelope(options.pczt);
  const request = createWalletReviewRequest({
    artifact,
    pczt: envelope,
    approvedManifestDigest: options.approvedManifestDigest,
  });
  const height = observedHeight(options.observedHeight);
  expiryForSnapshot(artifact, height);
  const payload = {
    schema: WALLET_PCZT_SNAPSHOT_SCHEMA,
    artifact,
    pcztBase64: request.pcztBase64,
    pcztByteSha256: request.pcztByteSha256,
    pcztVersion: request.pcztVersion,
    lifecycle: lifecycle(options.lifecycle),
    observedHeight: height,
  } satisfies Omit<WalletPcztRestartSnapshot, "checksum">;
  const checksum = sha256Bytes(Buffer.from(canonicalizeJson(snapshotPayload(payload), "wallet PCZT restart snapshot"), "utf8"));
  const snapshot = { ...payload, checksum } satisfies WalletPcztRestartSnapshot;
  verifyWalletPcztRestartSnapshotValue(snapshot, options.approvedManifestDigest);
  return deepFreeze(snapshot);
}

export function verifyWalletPcztRestartSnapshot(
  value: WalletPcztRestartSnapshot,
  options: { approvedManifestDigest: string; observedHeight?: number },
): void {
  verifyWalletPcztRestartSnapshotValue(value, options.approvedManifestDigest, options.observedHeight);
}

export function serializeWalletPcztRestartSnapshot(
  value: WalletPcztRestartSnapshot,
  approvedManifestDigest: string,
): string {
  verifyWalletPcztRestartSnapshotValue(value, approvedManifestDigest);
  return canonicalizeJson(value, "wallet PCZT restart snapshot");
}

export function parseWalletPcztRestartSnapshot(
  serialized: string,
  options: { approvedManifestDigest: string; observedHeight?: number },
): WalletPcztRestartSnapshot {
  const parsed = parseCanonicalJson(serialized, "Wallet PCZT restart snapshot");
  snapshotShapeGuard(parsed);
  const artifact = cloneArtifact(parsed.artifact);
  const normalized = {
    schema: WALLET_PCZT_SNAPSHOT_SCHEMA,
    artifact,
    pcztBase64: parsed.pcztBase64,
    pcztByteSha256: parsed.pcztByteSha256,
    pcztVersion: parsed.pcztVersion,
    lifecycle: lifecycle(parsed.lifecycle),
    observedHeight: observedHeight(parsed.observedHeight),
    checksum: parsed.checksum,
  } satisfies WalletPcztRestartSnapshot;
  verifyWalletPcztRestartSnapshotValue(normalized, options.approvedManifestDigest, options.observedHeight);
  return deepFreeze(normalized);
}

/** A restart is usable only when chain height is known and the artifact is live. */
export function assertWalletPcztRestartReady(
  value: WalletPcztRestartSnapshot,
  options: { approvedManifestDigest: string; observedHeight?: number },
): void {
  verifyWalletPcztRestartSnapshotValue(value, options.approvedManifestDigest, options.observedHeight);
  if (value.lifecycle === "failed" || value.lifecycle === "expired") {
    throw new Error(`Wallet PCZT restart lifecycle ${value.lifecycle} is not ready`);
  }
  const height = options.observedHeight ?? value.observedHeight;
  const assessment = evaluateExpiry(value.artifact.manifest.expiryHeight, height ?? undefined);
  if (assessment.state === "unresolved") throw new Error("Wallet PCZT restart expiry is unresolved");
  if (assessment.state === "expired") throw new Error("Wallet PCZT restart snapshot is expired");
}

export const parseZcashWalletPcztRestartSnapshot = parseWalletPcztRestartSnapshot;
export const serializeZcashWalletPcztRestartSnapshot = serializeWalletPcztRestartSnapshot;
