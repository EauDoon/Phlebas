import type { ZcashNetwork } from "./zcash-transparent.ts";

export const NU6_3_BRANCH_ID = 0x37a5165b;
export const V5_VERSION_GROUP_ID = 0x26a7270a;
export const V6_VERSION_GROUP_ID = 0xd884b698;
export const LOCKTIME_TIMESTAMP_THRESHOLD = 500_000_000;
export const MAX_BLOCK_HEIGHT = LOCKTIME_TIMESTAMP_THRESHOLD - 1;
export const MAX_UINT32 = 0xffff_ffff;
export const FINAL_SEQUENCE = MAX_UINT32;
export const LOCKTIME_ENABLED_SEQUENCE = MAX_UINT32 - 1;

const NU6_3_ACTIVATION_HEIGHTS = {
  mainnet: 3_428_143,
  testnet: 4_134_000,
} as const satisfies Record<ZcashNetwork, number>;

export type TransactionVersion = 5 | 6;
export type AbsoluteLock = Readonly<
  | { type: "height"; value: number }
  | { type: "timestamp"; value: number }
>;

export type Nu63EncodingProfile = Readonly<{
  id: `zcash-${ZcashNetwork}-nu6.3-v${TransactionVersion}`;
  network: ZcashNetwork;
  activationHeight: number;
  transactionVersion: TransactionVersion;
  versionGroupId: number;
  consensusBranchId: number;
  coinType: number;
}>;

export type ExpiryAssessment = Readonly<{
  state: "disabled" | "eligible" | "expired" | "unresolved";
  reason: string;
}>;

export type LockAssessment = Readonly<{
  state: "satisfied" | "early" | "unresolved";
  reason: string;
}>;

function uint32(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_UINT32) {
    throw new RangeError(`${label} must be an unsigned 32-bit integer`);
  }
  return value;
}

export function createNu63EncodingProfile(options: {
  network: ZcashNetwork;
  transactionVersion: TransactionVersion;
  coinType: number;
}): Nu63EncodingProfile {
  const activationHeight = NU6_3_ACTIVATION_HEIGHTS[options.network];
  if (activationHeight === undefined) throw new TypeError("Unsupported Zcash network");
  if (options.transactionVersion !== 5 && options.transactionVersion !== 6) {
    throw new RangeError("NU6.3 encoding profile supports only transaction versions 5 and 6");
  }
  return {
    id: `zcash-${options.network}-nu6.3-v${options.transactionVersion}`,
    network: options.network,
    activationHeight,
    transactionVersion: options.transactionVersion,
    versionGroupId: options.transactionVersion === 5 ? V5_VERSION_GROUP_ID : V6_VERSION_GROUP_ID,
    consensusBranchId: NU6_3_BRANCH_ID,
    coinType: uint32(options.coinType, "SLIP-44 coin type"),
  };
}

export function validateTargetHeight(profile: Nu63EncodingProfile, targetHeight: number): number {
  const height = uint32(targetHeight, "Target height");
  if (height > MAX_BLOCK_HEIGHT) throw new RangeError("Target height exceeds the block-height locktime range");
  if (height < profile.activationHeight) throw new RangeError("Target height precedes the selected consensus profile");
  return height;
}

export function validateExpiryHeight(
  profile: Nu63EncodingProfile,
  targetHeight: number,
  expiryHeight: number,
): number {
  const target = validateTargetHeight(profile, targetHeight);
  const expiry = uint32(expiryHeight, "Expiry height");
  if (expiry === 0) return expiry;
  if (expiry > MAX_BLOCK_HEIGHT) throw new RangeError("Expiry height exceeds the block-height range");
  if (expiry < target) throw new RangeError("Expiry height is earlier than the target height");
  return expiry;
}

export function validateAbsoluteLock(lock: AbsoluteLock): AbsoluteLock {
  const value = uint32(lock.value, "Absolute locktime");
  if (lock.type === "height") {
    if (value === 0 || value > MAX_BLOCK_HEIGHT) {
      throw new RangeError("Height locktime must be between 1 and 499,999,999");
    }
    return { type: "height", value };
  }
  if (lock.type === "timestamp") {
    if (value < LOCKTIME_TIMESTAMP_THRESHOLD) {
      throw new RangeError("Timestamp locktime must be at least 500,000,000");
    }
    return { type: "timestamp", value };
  }
  throw new TypeError("Unsupported absolute locktime type");
}

export function evaluateExpiry(expiryHeight: number, observedHeight?: number): ExpiryAssessment {
  const expiry = uint32(expiryHeight, "Expiry height");
  if (expiry === 0) return { state: "disabled", reason: "Transaction expiry is disabled" };
  if (expiry > MAX_BLOCK_HEIGHT) throw new RangeError("Expiry height exceeds the block-height range");
  if (observedHeight === undefined) {
    return { state: "unresolved", reason: "Observed chain height was not supplied" };
  }
  const observed = uint32(observedHeight, "Observed chain height");
  if (observed > MAX_BLOCK_HEIGHT) throw new RangeError("Observed chain height exceeds the block-height range");
  return observed <= expiry
    ? { state: "eligible", reason: "Observed height is no later than the expiry height" }
    : { state: "expired", reason: "Observed height is later than the expiry height" };
}

export function evaluateAbsoluteLock(
  lock: AbsoluteLock,
  observation: Readonly<{ height?: number; medianTimePast?: number }>,
): LockAssessment {
  const checked = validateAbsoluteLock(lock);
  const rawObservation = checked.type === "height" ? observation.height : observation.medianTimePast;
  if (rawObservation === undefined) {
    return {
      state: "unresolved",
      reason: checked.type === "height" ? "Observed chain height was not supplied" : "Median-time-past was not supplied",
    };
  }
  const observed = uint32(rawObservation, checked.type === "height" ? "Observed chain height" : "Median-time-past");
  return observed > checked.value
    ? { state: "satisfied", reason: "The observed locktime domain is strictly later than the contract lock" }
    : { state: "early", reason: "The observed locktime domain is not strictly later than the contract lock" };
}

export function sequenceForArtifact(kind: "fund" | "claim" | "refund"): number {
  return kind === "refund" ? LOCKTIME_ENABLED_SEQUENCE : FINAL_SEQUENCE;
}

export function assertArtifactSequence(kind: "fund" | "claim" | "refund", sequence: number): void {
  const checked = uint32(sequence, "Input sequence");
  if (checked !== sequenceForArtifact(kind)) {
    throw new RangeError(`${kind} input sequence does not match the fixed artifact policy`);
  }
}

export function replacementAssessment(policyId?: string): Readonly<{
  state: "policy-supplied" | "unresolved";
  reason: string;
}> {
  if (!policyId || policyId.trim() === "") {
    return { state: "unresolved", reason: "No node or wallet replacement policy was supplied" };
  }
  return { state: "policy-supplied", reason: `Replacement behavior is delegated to policy ${policyId}` };
}
