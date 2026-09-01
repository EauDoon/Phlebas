import { normalizeHex32, type Hex32 } from "./order-domain.ts";
import { sha256Hex } from "./sha256.ts";
import { canonicalArtifactJson, type ZcashArtifactKind } from "./zcash-artifact.ts";
import type { ZcashSwapProjectionV1 } from "./zcash-swap-projection.ts";

export const ZCASH_SETTLEMENT_BINDING_SCHEMA = "phlebas-zcash-settlement-artifact-binding-v1" as const;
export const ZCASH_SETTLEMENT_BINDING_BOUNDARY = "no-sign-no-extract-no-broadcast" as const;

export type ZcashSettlementArtifactBindingV1 = Readonly<{
  schema: typeof ZCASH_SETTLEMENT_BINDING_SCHEMA;
  boundary: typeof ZCASH_SETTLEMENT_BINDING_BOUNDARY;
  version: 1;
  swapId: Hex32;
  termsHash: Hex32;
  action: ZcashArtifactKind;
  artifactManifestDigest: string;
}>;

export type CommittedZcashSettlementArtifactBinding = Readonly<{
  binding: ZcashSettlementArtifactBindingV1;
  bindingDigest: Hex32;
}>;

function exactHex32(value: unknown, label: string): Hex32 {
  if (typeof value !== "string") throw new TypeError(`${label} must be a string`);
  const normalized = normalizeHex32(value, label);
  if (normalized !== value || normalized === `0x${"00".repeat(32)}`) {
    throw new TypeError(`${label} must be nonzero lowercase canonical hexadecimal`);
  }
  return normalized;
}

function manifestDigest(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) {
    throw new TypeError("Zcash artifact manifest digest must be 32 lowercase hexadecimal bytes");
  }
  return value;
}

function action(value: unknown): ZcashArtifactKind {
  if (value !== "fund" && value !== "claim" && value !== "refund") {
    throw new TypeError("Zcash settlement binding action is unsupported");
  }
  return value;
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const keys = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (keys.length !== wanted.length || keys.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} contains missing or unsupported fields`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object`);
  return value as Record<string, unknown>;
}

function canonicalBinding(value: unknown): ZcashSettlementArtifactBindingV1 {
  const binding = record(value, "Zcash settlement binding");
  exactKeys(binding, ["schema", "boundary", "version", "swapId", "termsHash", "action", "artifactManifestDigest"], "Zcash settlement binding");
  if (binding.schema !== ZCASH_SETTLEMENT_BINDING_SCHEMA
    || binding.boundary !== ZCASH_SETTLEMENT_BINDING_BOUNDARY
    || binding.version !== 1) {
    throw new TypeError("Zcash settlement binding schema, boundary, or version is unsupported");
  }
  return Object.freeze({
    schema: ZCASH_SETTLEMENT_BINDING_SCHEMA,
    boundary: ZCASH_SETTLEMENT_BINDING_BOUNDARY,
    version: 1,
    swapId: exactHex32(binding.swapId, "Zcash settlement binding swap ID"),
    termsHash: exactHex32(binding.termsHash, "Zcash settlement binding terms hash"),
    action: action(binding.action),
    artifactManifestDigest: manifestDigest(binding.artifactManifestDigest),
  });
}

function bindingDigest(binding: ZcashSettlementArtifactBindingV1): Hex32 {
  return sha256Hex(canonicalArtifactJson(binding as never));
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

export function commitZcashSettlementArtifactBinding(input: {
  projection: ZcashSwapProjectionV1;
  action: ZcashArtifactKind;
  artifactManifestDigest: string;
}): CommittedZcashSettlementArtifactBinding {
  const binding = canonicalBinding({
    schema: ZCASH_SETTLEMENT_BINDING_SCHEMA,
    boundary: ZCASH_SETTLEMENT_BINDING_BOUNDARY,
    version: 1,
    swapId: input.projection.swapId,
    termsHash: input.projection.termsHash,
    action: input.action,
    artifactManifestDigest: input.artifactManifestDigest,
  });
  return deepFreeze({ binding, bindingDigest: bindingDigest(binding) });
}

export function verifyZcashSettlementArtifactBinding(value: CommittedZcashSettlementArtifactBinding): void {
  const envelope = record(value, "Committed Zcash settlement binding");
  exactKeys(envelope, ["binding", "bindingDigest"], "Committed Zcash settlement binding");
  const binding = canonicalBinding(envelope.binding);
  const digest = exactHex32(envelope.bindingDigest, "Zcash settlement binding digest");
  if (digest !== bindingDigest(binding)) throw new Error("Zcash settlement binding digest does not match its contents");
}

export function serializeZcashSettlementArtifactBinding(value: CommittedZcashSettlementArtifactBinding): string {
  verifyZcashSettlementArtifactBinding(value);
  return canonicalArtifactJson(value as never);
}

export function parseZcashSettlementArtifactBinding(serialized: string): CommittedZcashSettlementArtifactBinding {
  if (typeof serialized !== "string" || serialized.length === 0 || serialized.trim() !== serialized) {
    throw new TypeError("Serialized Zcash settlement binding must not contain surrounding whitespace");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new TypeError("Serialized Zcash settlement binding must be valid JSON");
  }
  if (canonicalArtifactJson(parsed as never) !== serialized) {
    throw new TypeError("Serialized Zcash settlement binding must use canonical JSON");
  }
  verifyZcashSettlementArtifactBinding(parsed as CommittedZcashSettlementArtifactBinding);
  return deepFreeze(parsed as CommittedZcashSettlementArtifactBinding);
}
