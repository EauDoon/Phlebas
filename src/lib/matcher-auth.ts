import { hashOrderDomain, hashTypedOrder, type OrderDomain, type TypedOrderIntent } from "./eip712-order.ts";
import { keccak256Text } from "./keccak.ts";
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

export function hashMatcherControl(
  domain: OrderDomain,
  authorization: MatcherControlAuthorization,
): Hex32 {
  const lines = [
    "PhlebasMatcherControl",
    "version=1",
    `domain=${hashOrderDomain(domain)}`,
    `kind=${authorization.kind}`,
  ];
  if (authorization.kind === "cancel-order") {
    lines.push(
      `orderHash=${normalizeHex32(authorization.orderHash, "Cancelled order hash")}`,
      `makerAccountId=${normalizeHex32(authorization.makerAccountId, "Maker account ID")}`,
      `accountEpoch=${uint64(authorization.accountEpoch, "Account epoch")}`,
      `nonce=${uint64(authorization.nonce, "Order nonce")}`,
      `authorizedSignerId=${normalizeHex32(authorization.authorizedSignerId, "Authorized signer ID")}`,
    );
  } else if (authorization.kind === "advance-epoch") {
    const currentEpoch = uint64(authorization.currentEpoch, "Current account epoch");
    const nextEpoch = uint64(authorization.nextEpoch, "Next account epoch");
    if (authorization.nextEpoch <= authorization.currentEpoch) throw new RangeError("Next account epoch must increase");
    lines.push(
      `makerAccountId=${normalizeHex32(authorization.makerAccountId, "Maker account ID")}`,
      `currentEpoch=${currentEpoch}`,
      `nextEpoch=${nextEpoch}`,
      `authorizedSignerId=${normalizeHex32(authorization.authorizedSignerId, "Authorized signer ID")}`,
    );
  } else {
    lines.push(
      `quoteHash=${normalizeHex32(authorization.quoteHash, "Solver quote hash")}`,
      `solverAccountId=${normalizeHex32(authorization.solverAccountId, "Solver account ID")}`,
      `authorizedSignerId=${normalizeHex32(authorization.authorizedSignerId, "Authorized signer ID")}`,
    );
  }
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
