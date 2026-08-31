import assert from "node:assert/strict";
import test from "node:test";

import { keccak256Text } from "./keccak.ts";
import {
  assertApprovedSwapMarket,
  deriveSwapFillId,
  encodeSwapTerms,
  hashSwapMarketPolicy,
  hashSwapTerms,
  roleForParty,
  swapIdForTerms,
  validateSwapTerms,
} from "./swap-domain.ts";
import { hex20, sampleMarketPolicy, sampleSwapTerms } from "./swap-test-fixtures.ts";

test("validates and freezes exact native swap terms", () => {
  const terms = validateSwapTerms(sampleSwapTerms);
  assert.equal(Object.isFrozen(terms), true);
  assert.equal(terms.zecAmountZatoshis, 100_000_000n);
  assert.equal(roleForParty(terms, terms.zecSellerId), "zec-seller");
  assert.equal(roleForParty(terms, terms.stablecoinSellerId), "stablecoin-seller");
  assert.throws(() => roleForParty(terms, keccak256Text("outsider")), /not authorized/);
});

test("rejects ambiguous identities, self-trades, and unsupported chain namespaces", () => {
  const uppercaseFillId = `0x${sampleSwapTerms.fillId.slice(2).toUpperCase()}` as `0x${string}`;
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, fillId: uppercaseFillId }), /canonical/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, stablecoinSellerId: sampleSwapTerms.zecSellerId }), /distinct/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, quoteChain: "eip155:not-a-number" }), /numeric EIP-155/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, zecChain: "bip122:abc" }), /32-hex/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, quoteAsset: "eip155:421614/erc20:0x11" }), /ERC-20/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, quoteAsset: "eip155:421614/erc20:not-a-contract" }), /ERC-20/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, zecAsset: `${sampleSwapTerms.zecChain}/slip44:1` }), /slip44:133/);
});

test("keeps integer amounts positive and fees within the signed cap", () => {
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, zecAmountZatoshis: 0n }), /positive uint64/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, quoteAmountAtoms: 1.5 as unknown as bigint }), /bigint/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, maximumFeeBps: 31n }), /protocol cap/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, protocolFeeQuoteAtoms: 160_000n }), /signed maximum/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, quoteAmountAtoms: sampleSwapTerms.quoteAmountAtoms + 1n }), /does not reconcile/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, fillId: keccak256Text("unbound-fill") }), /canonical match fields/);
});

test("requires an exact signed market allowlist", () => {
  assert.equal(assertApprovedSwapMarket(sampleSwapTerms, sampleMarketPolicy).markets.length, 1);
  const otherPolicy = {
    version: 1 as const,
    markets: [{
      ...sampleMarketPolicy.markets[0]!,
      quoteAsset: `${sampleSwapTerms.quoteChain}/erc20:0x2222222222222222222222222222222222222222`,
    }],
  };
  const otherTerms = { ...sampleSwapTerms, marketPolicyId: hashSwapMarketPolicy(otherPolicy) };
  assert.throws(() => assertApprovedSwapMarket(otherTerms, otherPolicy), /not approved/);
  assert.throws(() => assertApprovedSwapMarket(sampleSwapTerms, otherPolicy), /does not match signed terms/);
});

test("rejects zero destinations and hashes", () => {
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, evmEscrowContract: hex20("0") }), /cannot be zero/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, secretHash: `0x${"00".repeat(32)}` }), /cannot be zero/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, zcashClaimPubKeyHash: hex20("0") }), /nonzero/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, zcashLockScriptHash: hex20("0") }), /nonzero/);
});

test("derives frozen SHA-256 terms and swap identifiers", () => {
  assert.match(encodeSwapTerms(sampleSwapTerms), /^PhlebasSwapTerms\nversion=1\nfillId=/);
  assert.equal(hashSwapTerms(sampleSwapTerms), "0x051db5dcaaaed152dd7bc9ebb2c5667fe5020b62e5d1a044d0d890fe0fcb31bc");
  assert.equal(swapIdForTerms(sampleSwapTerms), "0x94f3604d80d04f6ad738549c8c9da273b3defea2e53a6e0ebd9c26e390a01f46");
});

test("binds every signed field and distinguishes equal-sized partial fills", () => {
  const baseline = hashSwapTerms(sampleSwapTerms);
  const nextFill = { ...sampleSwapTerms, fillIndex: 1n };
  for (const changed of [
    { ...nextFill, fillId: deriveSwapFillId(nextFill) },
    { ...sampleSwapTerms, evmClaimRecipient: hex20("7") },
    { ...sampleSwapTerms, feeRecipient: hex20("8") },
    { ...sampleSwapTerms, evmRefundTime: sampleSwapTerms.evmRefundTime + 1n },
    { ...sampleSwapTerms, marketPolicyId: keccak256Text("different-market-policy") },
    { ...sampleSwapTerms, observerPolicyId: keccak256Text("different-observer-policy") },
  ]) {
    assert.notEqual(hashSwapTerms(changed), baseline);
    assert.notEqual(swapIdForTerms(changed), swapIdForTerms(sampleSwapTerms));
  }
});
