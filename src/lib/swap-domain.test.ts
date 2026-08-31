import assert from "node:assert/strict";
import test from "node:test";

import { keccak256Text } from "./keccak.ts";
import { roleForParty, validateSwapTerms, type SwapTermsV1 } from "./swap-domain.ts";

const hex20 = (byte: string) => `0x${byte.repeat(40)}` as `0x${string}`;

export const sampleSwapTerms: SwapTermsV1 = {
  version: 1,
  fillId: keccak256Text("fill-1"),
  fillIndex: 0n,
  zecOrderHash: keccak256Text("zec-order"),
  stablecoinOrderHash: keccak256Text("stablecoin-order"),
  zecSellerId: keccak256Text("zec-seller"),
  stablecoinSellerId: keccak256Text("stablecoin-seller"),
  zecChain: "bip122:00040fe8ec8471911baa1db1266ea15d",
  zecAsset: "bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133",
  quoteChain: "eip155:421614",
  quoteAsset: "eip155:421614/erc20:0x1111111111111111111111111111111111111111",
  zecAmountZatoshis: 100_000_000n,
  quoteAmountAtoms: 5_291_000n,
  executionPriceTicks: 5_291n,
  protocolFeeQuoteAtoms: 7_936n,
  maximumFeeBps: 30n,
  zcashClaimPubKeyHash: hex20("1"),
  zcashRefundPubKeyHash: hex20("2"),
  evmFunder: hex20("3"),
  evmClaimRecipient: hex20("4"),
  evmRefundRecipient: hex20("5"),
  evmEscrowContract: hex20("6"),
  secretHash: keccak256Text("fixture-sha256-value"),
  authorizationDeadline: 1_700_000_100n,
  zecFundBy: 1_700_000_200n,
  evmFundBy: 1_700_000_300n,
  evmClaimSafetyCutoff: 1_700_000_400n,
  evmRefundTime: 1_700_000_500n,
  zecRefundTime: 1_700_001_000n,
  timeoutPolicyId: keccak256Text("timeout-policy-fixture-v1"),
  observerPolicyId: keccak256Text("observer-policy-fixture-v1"),
  zecFinalityPolicyId: keccak256Text("zec-finality-fixture-v1"),
  evmFinalityPolicyId: keccak256Text("evm-finality-fixture-v1"),
};

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
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, quoteChain: "bip122:abc" }), /eip155/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, quoteAsset: "eip155:1/erc20:0x11" }), /on eip155:421614/);
});

test("keeps integer amounts positive and fees within the signed cap", () => {
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, zecAmountZatoshis: 0n }), /positive uint64/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, quoteAmountAtoms: 1.5 as unknown as bigint }), /bigint/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, maximumFeeBps: 31n }), /protocol cap/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, protocolFeeQuoteAtoms: 16_000n }), /signed maximum/);
});

test("rejects zero destinations and hashes", () => {
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, evmEscrowContract: hex20("0") }), /cannot be zero/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, secretHash: `0x${"00".repeat(32)}` }), /cannot be zero/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, zcashClaimPubKeyHash: hex20("0") }), /nonzero/);
});
