import assert from "node:assert/strict";
import test from "node:test";

import { createOrderDomain, type TypedOrderIntent } from "./eip712-order.ts";
import {
  createEvmEoaSignatureVerifier,
  evmAuthorizedSignerId,
  hashMatcherControl,
  verifySignedOrderIntent,
  type MatcherSignatureVerifier,
} from "./matcher-auth.ts";
import { accountIdentifier, adapterIdentifier, assetIdentifier, chainIdentifier } from "./order-domain.ts";

const CHAIN_ID = 421614n;
const MAKER = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
const FROZEN_DIGEST = "0x23cf06d636047955c46b031bd1e5e788d74321da1c19d01ee562b2e194cdc4e9";
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
    orderHash: FROZEN_DIGEST,
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

test("rejects malformed signatures without any signing capability", () => {
  const verifier = createEvmEoaSignatureVerifier(CHAIN_ID);
  assert.throws(() => verifier.verify(FROZEN_DIGEST, "0x", evmAuthorizedSignerId(CHAIN_ID, MAKER)), /65-byte signature/);
  assert.throws(() => evmAuthorizedSignerId(0n, MAKER), /positive/);
});
