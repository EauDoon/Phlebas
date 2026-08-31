import assert from "node:assert/strict";
import test from "node:test";

import { keccak256Text } from "./keccak.ts";
import {
  encodeSwapTerms,
  hashSwapTerms,
  roleForParty,
  swapIdForTerms,
  validateSwapTerms,
} from "./swap-domain.ts";
import { hex20, sampleSwapTerms } from "./swap-test-fixtures.ts";

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
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, protocolFeeQuoteAtoms: 16_000n }), /signed maximum/);
});

test("rejects zero destinations and hashes", () => {
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, evmEscrowContract: hex20("0") }), /cannot be zero/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, secretHash: `0x${"00".repeat(32)}` }), /cannot be zero/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, zcashClaimPubKeyHash: hex20("0") }), /nonzero/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, zcashLockScriptHash: hex20("0") }), /nonzero/);
});

test("derives frozen SHA-256 terms and swap identifiers", () => {
  assert.match(encodeSwapTerms(sampleSwapTerms), /^PhlebasSwapTerms\nversion=1\nfillId=/);
  assert.equal(hashSwapTerms(sampleSwapTerms), "0xbc6106da13bb38fab6d2f39bf3659a7f246935bc2e878dc8dd22cb0bf7527d11");
  assert.equal(swapIdForTerms(sampleSwapTerms), "0x01deb9463a2f65ce3477022234964ab731296c4d856955056a7fcef8d6fcf969");
});

test("binds every signed field and distinguishes equal-sized partial fills", () => {
  const baseline = hashSwapTerms(sampleSwapTerms);
  for (const changed of [
    { ...sampleSwapTerms, fillIndex: 1n },
    { ...sampleSwapTerms, quoteAmountAtoms: sampleSwapTerms.quoteAmountAtoms + 1n },
    { ...sampleSwapTerms, evmClaimRecipient: hex20("7") },
    { ...sampleSwapTerms, evmRefundTime: sampleSwapTerms.evmRefundTime + 1n },
    { ...sampleSwapTerms, observerPolicyId: keccak256Text("different-observer-policy") },
  ]) {
    assert.notEqual(hashSwapTerms(changed), baseline);
    assert.notEqual(swapIdForTerms(changed), swapIdForTerms(sampleSwapTerms));
  }
});
