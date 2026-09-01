import type { Hex32 } from "./order-domain.ts";
import { sha256Hex } from "./sha256.ts";
import { canonicalArtifactJson } from "./zcash-artifact.ts";
import {
  verifyTermsBoundZcashArtifact,
  type TermsBoundZcashArtifact,
} from "./zcash-bound-artifacts.ts";
import {
  PCZT_HEADER_VALIDATION,
  createWalletReviewRequest,
  verifyWalletReviewRequest,
  type PcztEnvelope,
  type WalletReviewRequest,
} from "./zcash-pczt.ts";
import {
  verifyZcashSettlementArtifactBinding,
  type CommittedZcashSettlementArtifactBinding,
} from "./zcash-settlement-binding.ts";
import { assertSwapStateIntegrity, type SwapState } from "./swap-state.ts";

export const BOUND_WALLET_REVIEW_SCHEMA = "phlebas-zcash-bound-wallet-review-v1" as const;
export const BOUND_WALLET_REVIEW_BLOCKERS = Object.freeze([
  "full-zip374-payload-verification-unavailable",
  "wallet-htlc-lifecycle-unqualified",
  "serialized-transaction-size-unresolved",
  "relayability-unresolved",
] as const);

export type BoundWalletReviewRequest = Readonly<{
  schema: typeof BOUND_WALLET_REVIEW_SCHEMA;
  validation: typeof PCZT_HEADER_VALIDATION;
  releaseState: "blocked";
  blockers: typeof BOUND_WALLET_REVIEW_BLOCKERS;
  settlementBinding: CommittedZcashSettlementArtifactBinding;
  walletReview: WalletReviewRequest;
  reviewDigest: Hex32;
}>;

function exactKeys(value: Record<string, unknown>, expected: readonly string[], label: string): void {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} contains missing or unsupported fields`);
  }
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new TypeError(`${label} must be a plain object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) throw new TypeError(`${label} must be a plain object`);
  return value as Record<string, unknown>;
}

function payload(value: Omit<BoundWalletReviewRequest, "reviewDigest">): string {
  return canonicalArtifactJson(value as never);
}

function exactBlockers(value: unknown): typeof BOUND_WALLET_REVIEW_BLOCKERS {
  if (!Array.isArray(value)
    || value.length !== BOUND_WALLET_REVIEW_BLOCKERS.length
    || value.some((blocker, index) => blocker !== BOUND_WALLET_REVIEW_BLOCKERS[index])) {
    throw new Error("Bound wallet review blockers do not preserve the fail-closed release boundary");
  }
  return BOUND_WALLET_REVIEW_BLOCKERS;
}

function deepFreeze<T>(value: T): T {
  if (value !== null && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}

export function verifyBoundWalletReviewRequest(value: BoundWalletReviewRequest): void {
  const envelope = record(value, "Bound wallet review request");
  exactKeys(envelope, [
    "schema", "validation", "releaseState", "blockers", "settlementBinding", "walletReview", "reviewDigest",
  ], "Bound wallet review request");
  if (envelope.schema !== BOUND_WALLET_REVIEW_SCHEMA
    || envelope.validation !== PCZT_HEADER_VALIDATION
    || envelope.releaseState !== "blocked") {
    throw new Error("Bound wallet review request does not preserve its header-only blocked boundary");
  }
  exactBlockers(envelope.blockers);
  verifyZcashSettlementArtifactBinding(envelope.settlementBinding as CommittedZcashSettlementArtifactBinding);
  const binding = (envelope.settlementBinding as CommittedZcashSettlementArtifactBinding).binding;
  verifyWalletReviewRequest(envelope.walletReview as WalletReviewRequest, binding.artifactManifestDigest);
  const walletReview = envelope.walletReview as WalletReviewRequest;
  if (walletReview.manifest.kind !== binding.action) {
    throw new Error("Bound wallet review action does not match its settlement artifact binding");
  }
  if (typeof envelope.reviewDigest !== "string" || envelope.reviewDigest !== sha256Hex(payload({
    schema: BOUND_WALLET_REVIEW_SCHEMA,
    validation: PCZT_HEADER_VALIDATION,
    releaseState: "blocked",
    blockers: BOUND_WALLET_REVIEW_BLOCKERS,
    settlementBinding: envelope.settlementBinding as CommittedZcashSettlementArtifactBinding,
    walletReview,
  }))) {
    throw new Error("Bound wallet review digest does not match its exact contents");
  }
}

export function createBoundWalletReviewRequest(options: {
  state: SwapState;
  boundArtifact: TermsBoundZcashArtifact;
  pczt: PcztEnvelope | string;
}): BoundWalletReviewRequest {
  assertSwapStateIntegrity(options.state);
  verifyTermsBoundZcashArtifact(
    options.state.terms,
    options.boundArtifact,
    options.boundArtifact.artifact.manifest.kind,
  );
  const walletReview = createWalletReviewRequest({
    artifact: options.boundArtifact.artifact,
    pczt: options.pczt,
    expectedManifestDigest: options.boundArtifact.artifact.manifestDigest,
  });
  const base = {
    schema: BOUND_WALLET_REVIEW_SCHEMA,
    validation: PCZT_HEADER_VALIDATION,
    releaseState: "blocked" as const,
    blockers: BOUND_WALLET_REVIEW_BLOCKERS,
    settlementBinding: options.boundArtifact.binding,
    walletReview,
  };
  const request = deepFreeze({ ...base, reviewDigest: sha256Hex(payload(base)) });
  verifyBoundWalletReviewRequest(request);
  return request;
}

export function serializeBoundWalletReviewRequest(value: BoundWalletReviewRequest): string {
  verifyBoundWalletReviewRequest(value);
  return canonicalArtifactJson(value as never);
}

export function parseBoundWalletReviewRequest(serialized: string): BoundWalletReviewRequest {
  if (typeof serialized !== "string" || serialized.length === 0 || serialized.trim() !== serialized) {
    throw new TypeError("Serialized bound wallet review must not contain surrounding whitespace");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    throw new TypeError("Serialized bound wallet review must be valid JSON");
  }
  if (canonicalArtifactJson(parsed as never) !== serialized) throw new TypeError("Serialized bound wallet review must use canonical JSON");
  verifyBoundWalletReviewRequest(parsed as BoundWalletReviewRequest);
  return deepFreeze(parsed as BoundWalletReviewRequest);
}
