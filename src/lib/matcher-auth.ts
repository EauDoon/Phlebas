import {
  EIP712_DOMAIN_TYPE,
  hashOrderDomain,
  hashTypedOrder,
  type Eip712Domain,
  type OrderDomain,
  type TypedOrderIntent,
} from "./eip712-order.ts";
import { bytesToHex, hexToBytes, keccak256, keccak256Text } from "./keccak.ts";
import {
  UINT64_MAX,
  accountIdentifier,
  assertUint,
  normalizeAddress,
  normalizeHex32,
  type Hex32,
} from "./order-domain.ts";
import { recoverAddress } from "./secp256k1.ts";

export type MatcherSignatureVerifier = Readonly<{
  verify(digest: Hex32, signature: string, authorizedSignerId: Hex32): void;
}>;

export const MATCHER_CONTROL_DOMAIN_NAME = "Phlebas Matcher Control" as const;
export const MATCHER_CONTROL_DOMAIN_VERSION = "1" as const;
export const CANCEL_ORDER_TYPE = "CancelOrder(bytes32 orderHash,bytes32 makerAccountId,uint64 accountEpoch,uint64 nonce,bytes32 authorizedSignerId)" as const;
export const ADVANCE_EPOCH_TYPE = "AdvanceEpoch(bytes32 makerAccountId,uint64 currentEpoch,uint64 nextEpoch,bytes32 authorizedSignerId)" as const;

export type MatcherControlDomain = Eip712Domain & Readonly<{
  name: typeof MATCHER_CONTROL_DOMAIN_NAME;
  version: typeof MATCHER_CONTROL_DOMAIN_VERSION;
}>;

export type MatcherControlAuthorization =
  | Readonly<{
    kind: "cancel-order";
    orderHash: Hex32;
    makerAccountId: Hex32;
    accountEpoch: bigint;
    nonce: bigint;
    authorizedSignerId: Hex32;
  }>
  | Readonly<{
    kind: "advance-epoch";
    makerAccountId: Hex32;
    currentEpoch: bigint;
    nextEpoch: bigint;
    authorizedSignerId: Hex32;
  }>
  | Readonly<{
    kind: "cancel-solver-quote";
    quoteHash: Hex32;
    solverAccountId: Hex32;
    authorizedSignerId: Hex32;
  }>;

export function evmAuthorizedSignerId(chainId: bigint, address: string): Hex32 {
  assertUint(chainId, 256, "Signer chain ID");
  if (chainId === 0n) throw new RangeError("Signer chain ID must be positive");
  const normalized = normalizeAddress(address, "Authorized signer address");
  return accountIdentifier(`eip155:${chainId}:${normalized}`);
}

export function createEvmEoaSignatureVerifier(chainId: bigint): MatcherSignatureVerifier {
  assertUint(chainId, 256, "Signer chain ID");
  if (chainId === 0n) throw new RangeError("Signer chain ID must be positive");
  return {
    verify(digest, signature, authorizedSignerId) {
      const normalizedDigest = normalizeHex32(digest, "Signed digest");
      const normalizedSigner = normalizeHex32(authorizedSignerId, "Authorized signer ID");
      const recovered = recoverAddress(normalizedDigest, signature);
      if (evmAuthorizedSignerId(chainId, recovered) !== normalizedSigner) {
        throw new Error("Signature does not match the authorized signer ID");
      }
    },
  };
}

export function verifySignedOrderIntent(
  verifier: MatcherSignatureVerifier,
  domain: OrderDomain,
  order: TypedOrderIntent,
  signature: string,
): Hex32 {
  const digest = hashTypedOrder(domain, order);
  verifier.verify(digest, signature, normalizeHex32(order.authorizedSignerId, "Authorized signer ID"));
  return digest;
}

function uint64(value: bigint, label: string): string {
  if (typeof value !== "bigint" || value < 0n || value > UINT64_MAX) throw new RangeError(`${label} must fit uint64`);
  return value.toString();
}

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

function encodeHex32(value: Hex32, label: string): Uint8Array {
  return hexToBytes(normalizeHex32(value, label));
}

function encodeUint64(value: bigint, label: string): Uint8Array {
  return hexToBytes(BigInt(uint64(value, label)).toString(16).padStart(64, "0"));
}

function fields(type: string): ReadonlyArray<Readonly<{ name: string; type: string }>> {
  return type.slice(type.indexOf("(") + 1, -1).split(",").map((field) => {
    const splitAt = field.lastIndexOf(" ");
    return { type: field.slice(0, splitAt), name: field.slice(splitAt + 1) };
  });
}

export function matcherControlDomain(domain: OrderDomain): MatcherControlDomain {
  const controlDomain = {
    name: MATCHER_CONTROL_DOMAIN_NAME,
    version: MATCHER_CONTROL_DOMAIN_VERSION,
    chainId: domain.chainId,
    verifyingContract: normalizeAddress(domain.verifyingContract, "Matcher control verifying contract"),
  } as const;
  hashOrderDomain(controlDomain);
  return controlDomain;
}

export function hashMatcherControlStruct(authorization: MatcherControlAuthorization): Hex32 {
  if (authorization.kind === "cancel-order") {
    return bytesToHex32(keccak256(concatBytes(
      hexToBytes(keccak256Text(CANCEL_ORDER_TYPE)),
      encodeHex32(authorization.orderHash, "Cancelled order hash"),
      encodeHex32(authorization.makerAccountId, "Maker account ID"),
      encodeUint64(authorization.accountEpoch, "Account epoch"),
      encodeUint64(authorization.nonce, "Order nonce"),
      encodeHex32(authorization.authorizedSignerId, "Authorized signer ID"),
    )));
  }
  if (authorization.kind === "advance-epoch") {
    if (authorization.nextEpoch <= authorization.currentEpoch) throw new RangeError("Next account epoch must increase");
    return bytesToHex32(keccak256(concatBytes(
      hexToBytes(keccak256Text(ADVANCE_EPOCH_TYPE)),
      encodeHex32(authorization.makerAccountId, "Maker account ID"),
      encodeUint64(authorization.currentEpoch, "Current account epoch"),
      encodeUint64(authorization.nextEpoch, "Next account epoch"),
      encodeHex32(authorization.authorizedSignerId, "Authorized signer ID"),
    )));
  }
  throw new TypeError("Solver quote cancellation is not an injected-wallet control");
}

export function hashMatcherControl(
  domain: OrderDomain,
  authorization: MatcherControlAuthorization,
): Hex32 {
  if (authorization.kind === "cancel-solver-quote") {
    return legacyMatcherControlHash(domain, authorization);
  }
  const controlDomain = matcherControlDomain(domain);
  return bytesToHex32(keccak256(concatBytes(
    new Uint8Array([0x19, 0x01]),
    hexToBytes(hashOrderDomain(controlDomain)),
    hexToBytes(hashMatcherControlStruct(authorization)),
  )));
}

export function typedMatcherControlData(
  domain: OrderDomain,
  authorization: Exclude<MatcherControlAuthorization, { kind: "cancel-solver-quote" }>,
) {
  const controlDomain = matcherControlDomain(domain);
  hashMatcherControl(domain, authorization);
  const primaryType = authorization.kind === "cancel-order" ? "CancelOrder" : "AdvanceEpoch";
  const type = authorization.kind === "cancel-order" ? CANCEL_ORDER_TYPE : ADVANCE_EPOCH_TYPE;
  const message = authorization.kind === "cancel-order"
    ? {
      orderHash: normalizeHex32(authorization.orderHash, "Cancelled order hash"),
      makerAccountId: normalizeHex32(authorization.makerAccountId, "Maker account ID"),
      accountEpoch: uint64(authorization.accountEpoch, "Account epoch"),
      nonce: uint64(authorization.nonce, "Order nonce"),
      authorizedSignerId: normalizeHex32(authorization.authorizedSignerId, "Authorized signer ID"),
    }
    : {
      makerAccountId: normalizeHex32(authorization.makerAccountId, "Maker account ID"),
      currentEpoch: uint64(authorization.currentEpoch, "Current account epoch"),
      nextEpoch: uint64(authorization.nextEpoch, "Next account epoch"),
      authorizedSignerId: normalizeHex32(authorization.authorizedSignerId, "Authorized signer ID"),
    };
  return {
    domain: {
      name: controlDomain.name,
      version: controlDomain.version,
      chainId: controlDomain.chainId.toString(),
      verifyingContract: controlDomain.verifyingContract,
    },
    primaryType,
    types: {
      EIP712Domain: fields(EIP712_DOMAIN_TYPE),
      [primaryType]: fields(type),
    },
    message,
  };
}

/*
 * Solver quote cancellation remains an operator-signed raw control in v1.
 * User-owned order controls use the EIP-712 path above.
 */
function legacyMatcherControlHash(
  domain: OrderDomain,
  authorization: Extract<MatcherControlAuthorization, { kind: "cancel-solver-quote" }>,
): Hex32 {
  const lines = [
    "PhlebasMatcherControl",
    "version=1",
    `domain=${hashOrderDomain(domain)}`,
    `kind=${authorization.kind}`,
  ];
  lines.push(
    `quoteHash=${normalizeHex32(authorization.quoteHash, "Solver quote hash")}`,
    `solverAccountId=${normalizeHex32(authorization.solverAccountId, "Solver account ID")}`,
    `authorizedSignerId=${normalizeHex32(authorization.authorizedSignerId, "Authorized signer ID")}`,
  );
  return keccak256Text(lines.join("\n"));
}

export function verifyMatcherControl(
  verifier: MatcherSignatureVerifier,
  domain: OrderDomain,
  authorization: MatcherControlAuthorization,
  signature: string,
): Hex32 {
  const digest = hashMatcherControl(domain, authorization);
  verifier.verify(digest, signature, normalizeHex32(authorization.authorizedSignerId, "Authorized signer ID"));
  return digest;
}
