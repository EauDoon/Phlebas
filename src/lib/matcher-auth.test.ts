import assert from "node:assert/strict";
import test from "node:test";

import { createOrderDomain, type TypedOrderIntent } from "./eip712-order.ts";
import {
  ADVANCE_EPOCH_TYPE,
  CANCEL_ORDER_TYPE,
  MATCHER_CONTROL_DOMAIN_NAME,
  createEvmEoaSignatureVerifier,
  evmAuthorizedSignerId,
  hashLegacyMatcherControlForReplay,
  hashMatcherControl,
  hashMatcherControlStruct,
  typedMatcherControlData,
  verifyLegacyMatcherControlForReplay,
  verifyMatcherControl,
  verifySignedOrderIntent,
  type MatcherSignatureVerifier,
} from "./matcher-auth.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier, type Hex32 } from "./order-domain.ts";

const CHAIN_ID = 421614n;
const MAKER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const FROZEN_DIGEST: Hex32 = "0x23cf06d636047955c46b031bd1e5e788d74321da1c19d01ee562b2e194cdc4e9";
const FROZEN_SIGNATURE = "0x25dda9696a4eed8b907e5b9fcb79f39169284f1c544f992627af993faa4a61e63c69c69b68a6306e970377cdcb9af0bb1dac6cd4f223f2fbba034c06682651091b";
const domain = createOrderDomain(CHAIN_ID, "0x1111111111111111111111111111111111111111");

function order(): TypedOrderIntent {
  return {
    makerAccountId: accountIdentifier("session:maker"),
    authorizedSignerId: evmAuthorizedSignerId(CHAIN_ID, MAKER),
    recipientAccountId: accountIdentifier("session:recipient"),
    baseChainId: chainIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d"),
    baseAssetId: assetIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133"),
    quoteChainId: chainIdentifier("eip155:421614"),
    quoteAssetId: assetIdentifier("eip155:421614/erc20:0x2222222222222222222222222222222222222222"),
    side: 0,
    baseAmountAtoms: 100_000_000n,
    limitPriceTicks: 5_291n,
    nonce: 1n,
    accountEpoch: 0n,
    expiry: 2_000_000_000n,
    salt: `0x${"12".repeat(32)}`,
    timeInForce: 0,
    maximumFeeBps: 30n,
    allowedVenues: 1,
    settlementAdapterId: adapterIdentifier("transparent-htlc-v1"),
  };
}

test("recovers an EVM EOA and binds it to the chain-qualified signer ID", () => {
  const verifier = createEvmEoaSignatureVerifier(CHAIN_ID);
  assert.doesNotThrow(() => verifier.verify(FROZEN_DIGEST, FROZEN_SIGNATURE, evmAuthorizedSignerId(CHAIN_ID, MAKER)));
  assert.throws(
    () => verifier.verify(FROZEN_DIGEST, FROZEN_SIGNATURE, evmAuthorizedSignerId(CHAIN_ID + 1n, MAKER)),
    /does not match/,
  );
});

test("verifies the exact typed-order digest through a pluggable authenticator", () => {
  let observed = "";
  const verifier: MatcherSignatureVerifier = {
    verify(digest, signature, signerId) {
      observed = `${digest}:${signature}:${signerId}`;
    },
  };
  const value = order();
  const digest = verifySignedOrderIntent(verifier, domain, value, "fixture-signature");
  assert.ok(observed.startsWith(`${digest}:fixture-signature:`));
  assert.ok(observed.endsWith(value.authorizedSignerId));
});

test("control authorization hashes bind domain, action, signer, nonce, and epoch", () => {
  const value = order();
  const cancel = hashMatcherControl(domain, {
    kind: "cancel-order",
    orderHash: FROZEN_DIGEST as Hex32,
    makerAccountId: value.makerAccountId,
    accountEpoch: value.accountEpoch,
    nonce: value.nonce,
    authorizedSignerId: value.authorizedSignerId,
  });
  assert.notEqual(cancel, hashMatcherControl(domain, {
    kind: "cancel-order",
    orderHash: FROZEN_DIGEST,
    makerAccountId: value.makerAccountId,
    accountEpoch: value.accountEpoch,
    nonce: value.nonce + 1n,
    authorizedSignerId: value.authorizedSignerId,
  }));
  assert.notEqual(cancel, hashMatcherControl(createOrderDomain(CHAIN_ID + 1n, domain.verifyingContract), {
    kind: "cancel-order",
    orderHash: FROZEN_DIGEST,
    makerAccountId: value.makerAccountId,
    accountEpoch: value.accountEpoch,
    nonce: value.nonce,
    authorizedSignerId: value.authorizedSignerId,
  }));
  assert.throws(() => hashMatcherControl(domain, {
    kind: "advance-epoch",
    makerAccountId: value.makerAccountId,
    currentEpoch: 1n,
    nextEpoch: 1n,
    authorizedSignerId: value.authorizedSignerId,
  }), /must increase/);
});

test("exports distinct clear-signing EIP-712 controls", () => {
  const value = order();
  const cancellation = {
    kind: "cancel-order" as const,
    orderHash: FROZEN_DIGEST as Hex32,
    makerAccountId: value.makerAccountId,
    accountEpoch: value.accountEpoch,
    nonce: value.nonce,
    authorizedSignerId: value.authorizedSignerId,
  };
  const epoch = {
    kind: "advance-epoch" as const,
    makerAccountId: value.makerAccountId,
    currentEpoch: value.accountEpoch,
    nextEpoch: value.accountEpoch + 1n,
    authorizedSignerId: value.authorizedSignerId,
  };
  const cancellationData = typedMatcherControlData(domain, cancellation);
  const epochData = typedMatcherControlData(domain, epoch);

  assert.equal(cancellationData.domain.name, MATCHER_CONTROL_DOMAIN_NAME);
  assert.equal(cancellationData.domain.chainId, CHAIN_ID.toString());
  assert.equal(cancellationData.primaryType, "CancelOrder");
  assert.equal(cancellationData.types.CancelOrder?.length, 5);
  assert.ok("nonce" in cancellationData.message);
  assert.equal(cancellationData.message.nonce, value.nonce.toString());
  assert.equal(epochData.primaryType, "AdvanceEpoch");
  assert.equal(epochData.types.AdvanceEpoch?.length, 4);
  assert.ok("nextEpoch" in epochData.message);
  assert.equal(epochData.message.nextEpoch, "1");
  assert.doesNotThrow(() => JSON.stringify(cancellationData));
  assert.doesNotThrow(() => JSON.stringify(epochData));
  assert.notEqual(hashMatcherControlStruct(cancellation), hashMatcherControlStruct(epoch));
  assert.notEqual(hashMatcherControl(domain, cancellation), hashMatcherControl(domain, epoch));
  assert.match(CANCEL_ORDER_TYPE, /^CancelOrder\(/);
  assert.match(ADVANCE_EPOCH_TYPE, /^AdvanceEpoch\(/);
});

test("verifies the exact typed-control digest through a pluggable authenticator", () => {
  const value = order();
  const authorization = {
    kind: "advance-epoch" as const,
    makerAccountId: value.makerAccountId,
    currentEpoch: 0n,
    nextEpoch: 1n,
    authorizedSignerId: value.authorizedSignerId,
  };
  let observed = "";
  const verifier: MatcherSignatureVerifier = {
    verify(digest, signature, signerId) {
      observed = `${digest}:${signature}:${signerId}`;
    },
  };
  const digest = verifyMatcherControl(verifier, domain, authorization, "fixture-signature");
  assert.equal(digest, hashMatcherControl(domain, authorization));
  assert.equal(observed, `${digest}:fixture-signature:${value.authorizedSignerId}`);
});

test("keeps the pre-EIP-712 user-control digest bounded to compatibility replay", () => {
  const value = order();
  const authorization = {
    kind: "cancel-order" as const,
    orderHash: FROZEN_DIGEST,
    makerAccountId: value.makerAccountId,
    accountEpoch: value.accountEpoch,
    nonce: value.nonce,
    authorizedSignerId: value.authorizedSignerId,
  };
  const legacyDigest = hashLegacyMatcherControlForReplay(domain, authorization);
  assert.equal(legacyDigest, "0x78f35c2ede22497c1d76115820d02f2ea450ede313245f4038166d55ccee95ca");
  assert.notEqual(legacyDigest, hashMatcherControl(domain, authorization));
  assert.equal(hashLegacyMatcherControlForReplay(domain, {
    kind: "advance-epoch",
    makerAccountId: value.makerAccountId,
    currentEpoch: 0n,
    nextEpoch: 1n,
    authorizedSignerId: value.authorizedSignerId,
  }), "0xe6bee9c6ff6b2c06271c5fb8131d238aacca117570d1b7bfa834cc5288db21e9");
  let observed = "";
  const verifier: MatcherSignatureVerifier = {
    verify(digest, signature, signerId) {
      observed = `${digest}:${signature}:${signerId}`;
    },
  };
  assert.equal(
    verifyLegacyMatcherControlForReplay(verifier, domain, authorization, "legacy-signature"),
    legacyDigest,
  );
  assert.equal(observed, `${legacyDigest}:legacy-signature:${value.authorizedSignerId}`);
});

test("rejects malformed signatures without any signing capability", () => {
  const verifier = createEvmEoaSignatureVerifier(CHAIN_ID);
  assert.throws(() => verifier.verify(FROZEN_DIGEST, "0x", evmAuthorizedSignerId(CHAIN_ID, MAKER)), /65-byte signature/);
  assert.throws(() => evmAuthorizedSignerId(0n, MAKER), /positive/);
});
