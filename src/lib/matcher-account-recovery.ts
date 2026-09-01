import {
  EIP712_DOMAIN_TYPE,
  hashOrderDomain,
  type Eip712Domain,
  type OrderDomain,
} from "./eip712-order.ts";
import { bytesToHex, hexToBytes, keccak256, keccak256Text } from "./keccak.ts";
import type { MatcherSignatureVerifier } from "./matcher-auth.ts";
import {
  UINT64_MAX,
  normalizeAddress,
  normalizeHex32,
  type Hex32,
} from "./order-domain.ts";

export const MATCHER_ACCOUNT_RECOVERY_DOMAIN_NAME = "Phlebas Matcher Account Recovery" as const;
export const MATCHER_ACCOUNT_RECOVERY_DOMAIN_VERSION = "1" as const;
export const RECOVER_OPEN_ORDERS_TYPE = "RecoverOpenOrders(bytes32 makerAccountId,bytes32 configurationHash,uint64 checkpointSequence,bytes32 checkpointRecordHash,bytes32 checkpointStateRoot,uint64 afterSequence,uint16 limit,bytes32 challenge,uint64 expiresAtSeconds)" as const;
export const MAX_MATCHER_ACCOUNT_RECOVERY_PAGE_SIZE = 100;

export type MatcherAccountRecoveryDomain = Eip712Domain & Readonly<{
  name: typeof MATCHER_ACCOUNT_RECOVERY_DOMAIN_NAME;
  version: typeof MATCHER_ACCOUNT_RECOVERY_DOMAIN_VERSION;
}>;

export type MatcherAccountRecoveryAuthorization = Readonly<{
  makerAccountId: Hex32;
  configurationHash: Hex32;
  checkpointSequence: bigint;
  checkpointRecordHash: Hex32;
  checkpointStateRoot: Hex32;
  afterSequence: bigint;
  limit: number;
  challenge: Hex32;
  expiresAtSeconds: bigint;
}>;

function concatBytes(...values: Uint8Array[]): Uint8Array {
  const output = new Uint8Array(values.reduce((total, value) => total + value.length, 0));
  let offset = 0;
  for (const value of values) {
    output.set(value, offset);
    offset += value.length;
  }
  return output;
}

function bytesToHex32(value: Uint8Array): Hex32 {
  return `0x${bytesToHex(value)}`;
}

function encodeHex32(value: string, label: string): Uint8Array {
  return hexToBytes(normalizeHex32(value, label));
}

function encodeUint(value: bigint, bits: 16 | 64, label: string): Uint8Array {
  if (typeof value !== "bigint" || value < 0n || value >= (1n << BigInt(bits))) {
    throw new RangeError(`${label} must fit uint${bits}`);
  }
  return hexToBytes(value.toString(16).padStart(64, "0"));
}

function uint64(value: bigint, label: string): bigint {
  if (typeof value !== "bigint" || value < 0n || value > UINT64_MAX) {
    throw new RangeError(`${label} must fit uint64`);
  }
  return value;
}

function pageLimit(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0 || value > MAX_MATCHER_ACCOUNT_RECOVERY_PAGE_SIZE) {
    throw new RangeError(`Recovery page limit must be from 1 to ${MAX_MATCHER_ACCOUNT_RECOVERY_PAGE_SIZE}`);
  }
  return value;
}

function fields(type: string): ReadonlyArray<Readonly<{ name: string; type: string }>> {
  return type.slice(type.indexOf("(") + 1, -1).split(",").map((field) => {
    const splitAt = field.lastIndexOf(" ");
    return { type: field.slice(0, splitAt), name: field.slice(splitAt + 1) };
  });
}

export function matcherAccountRecoveryDomain(domain: OrderDomain): MatcherAccountRecoveryDomain {
  const recoveryDomain = {
    name: MATCHER_ACCOUNT_RECOVERY_DOMAIN_NAME,
    version: MATCHER_ACCOUNT_RECOVERY_DOMAIN_VERSION,
    chainId: domain.chainId,
    verifyingContract: normalizeAddress(domain.verifyingContract, "Matcher recovery verifying contract"),
  } as const;
  hashOrderDomain(recoveryDomain);
  return recoveryDomain;
}

export function canonicalMatcherAccountRecoveryAuthorization(
  authorization: MatcherAccountRecoveryAuthorization,
): MatcherAccountRecoveryAuthorization {
  return Object.freeze({
    makerAccountId: normalizeHex32(authorization.makerAccountId, "Recovery maker account ID"),
    configurationHash: normalizeHex32(authorization.configurationHash, "Recovery configuration hash"),
    checkpointSequence: uint64(authorization.checkpointSequence, "Recovery checkpoint sequence"),
    checkpointRecordHash: normalizeHex32(authorization.checkpointRecordHash, "Recovery checkpoint record hash"),
    checkpointStateRoot: normalizeHex32(authorization.checkpointStateRoot, "Recovery checkpoint state root"),
    afterSequence: uint64(authorization.afterSequence, "Recovery page cursor"),
    limit: pageLimit(authorization.limit),
    challenge: normalizeHex32(authorization.challenge, "Recovery challenge"),
    expiresAtSeconds: uint64(authorization.expiresAtSeconds, "Recovery challenge expiry"),
  });
}

export function hashMatcherAccountRecoveryStruct(
  input: MatcherAccountRecoveryAuthorization,
): Hex32 {
  const authorization = canonicalMatcherAccountRecoveryAuthorization(input);
  return bytesToHex32(keccak256(concatBytes(
    hexToBytes(keccak256Text(RECOVER_OPEN_ORDERS_TYPE)),
    encodeHex32(authorization.makerAccountId, "Recovery maker account ID"),
    encodeHex32(authorization.configurationHash, "Recovery configuration hash"),
    encodeUint(authorization.checkpointSequence, 64, "Recovery checkpoint sequence"),
    encodeHex32(authorization.checkpointRecordHash, "Recovery checkpoint record hash"),
    encodeHex32(authorization.checkpointStateRoot, "Recovery checkpoint state root"),
    encodeUint(authorization.afterSequence, 64, "Recovery page cursor"),
    encodeUint(BigInt(authorization.limit), 16, "Recovery page limit"),
    encodeHex32(authorization.challenge, "Recovery challenge"),
    encodeUint(authorization.expiresAtSeconds, 64, "Recovery challenge expiry"),
  )));
}

export function hashMatcherAccountRecovery(
  domain: OrderDomain,
  authorization: MatcherAccountRecoveryAuthorization,
): Hex32 {
  const recoveryDomain = matcherAccountRecoveryDomain(domain);
  return bytesToHex32(keccak256(concatBytes(
    new Uint8Array([0x19, 0x01]),
    hexToBytes(hashOrderDomain(recoveryDomain)),
    hexToBytes(hashMatcherAccountRecoveryStruct(authorization)),
  )));
}

export function typedMatcherAccountRecoveryData(
  domain: OrderDomain,
  input: MatcherAccountRecoveryAuthorization,
) {
  const authorization = canonicalMatcherAccountRecoveryAuthorization(input);
  const recoveryDomain = matcherAccountRecoveryDomain(domain);
  hashMatcherAccountRecovery(domain, authorization);
  return {
    domain: {
      name: recoveryDomain.name,
      version: recoveryDomain.version,
      chainId: recoveryDomain.chainId.toString(),
      verifyingContract: recoveryDomain.verifyingContract,
    },
    primaryType: "RecoverOpenOrders",
    types: {
      EIP712Domain: fields(EIP712_DOMAIN_TYPE),
      RecoverOpenOrders: fields(RECOVER_OPEN_ORDERS_TYPE),
    },
    message: {
      makerAccountId: authorization.makerAccountId,
      configurationHash: authorization.configurationHash,
      checkpointSequence: authorization.checkpointSequence.toString(),
      checkpointRecordHash: authorization.checkpointRecordHash,
      checkpointStateRoot: authorization.checkpointStateRoot,
      afterSequence: authorization.afterSequence.toString(),
      limit: authorization.limit,
      challenge: authorization.challenge,
      expiresAtSeconds: authorization.expiresAtSeconds.toString(),
    },
  } as const;
}

export function verifyMatcherAccountRecovery(
  verifier: MatcherSignatureVerifier,
  domain: OrderDomain,
  authorization: MatcherAccountRecoveryAuthorization,
  signature: string,
): Hex32 {
  const canonical = canonicalMatcherAccountRecoveryAuthorization(authorization);
  const digest = hashMatcherAccountRecovery(domain, canonical);
  verifier.verify(digest, signature, canonical.makerAccountId);
  return digest;
}
