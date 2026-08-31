import assert from "node:assert/strict";
import test from "node:test";

import { keccak256Text } from "./keccak.ts";
import { hashSwapTerms, validateSwapTerms, type SwapTermsV1 } from "./swap-domain.ts";
import { appendSwapEvent, emptySwapJournal } from "./swap-journal.ts";
import { swapDeadlineStatus } from "./swap-policy.ts";
import { swapStateRoot } from "./swap-root.ts";
import {
  authorizedSwap,
  fixtureSecretHash,
  fundedSwap,
  fundingEvidence,
  hex20,
  sampleSwapTerms,
  spendEvidence,
} from "./swap-test-fixtures.ts";
import { authorizeSwapTerms, createSwapState, observeSwapFunding, observeSwapSpend, prepareSwapFunding } from "./swap-state.ts";

test("binds canonical terms into every state root and transition", () => {
  const initial = createSwapState(sampleSwapTerms, {
    minimumFundingWindowSeconds: 100n,
    minimumClaimWindowSeconds: 100n,
    minimumSafetyWindowSeconds: 500n,
  });
  const changedTerms = { ...initial.terms, zecRefundTime: initial.terms.zecRefundTime + 1n };
  const tampered = { ...initial, terms: changedTerms };
  assert.throws(() => swapStateRoot(tampered), /signed terms hash/);
  assert.throws(
    () => authorizeSwapTerms(tampered, initial.terms.zecSellerId, initial.termsHash, 1n),
    /signed terms hash/,
  );
  assert.throws(
    () => appendSwapEvent(emptySwapJournal(initial), tampered, {
      kind: "authorize-terms",
      partyId: initial.terms.zecSellerId,
      termsHash: initial.termsHash,
      occurredAtSeconds: 1n,
    }),
    /signed terms hash/,
  );
});

test("binds every mutable signed term to the terms digest", () => {
  const mutations: readonly SwapTermsV1[] = [
    { ...sampleSwapTerms, fillId: keccak256Text("other-fill") },
    { ...sampleSwapTerms, fillIndex: 1n },
    { ...sampleSwapTerms, zecOrderHash: keccak256Text("other-zec-order") },
    { ...sampleSwapTerms, stablecoinOrderHash: keccak256Text("other-quote-order") },
    { ...sampleSwapTerms, zecSellerId: keccak256Text("other-zec-seller") },
    { ...sampleSwapTerms, stablecoinSellerId: keccak256Text("other-quote-seller") },
    { ...sampleSwapTerms, zecChain: "bip122:11111111111111111111111111111111", zecAsset: "bip122:11111111111111111111111111111111/slip44:133" },
    { ...sampleSwapTerms, quoteChain: "eip155:1", quoteAsset: "eip155:1/erc20:0x1111111111111111111111111111111111111111" },
    { ...sampleSwapTerms, quoteAsset: `${sampleSwapTerms.quoteChain}/erc20:0x2222222222222222222222222222222222222222` },
    { ...sampleSwapTerms, zecAmountZatoshis: sampleSwapTerms.zecAmountZatoshis + 1n },
    { ...sampleSwapTerms, quoteAmountAtoms: sampleSwapTerms.quoteAmountAtoms + 1n },
    { ...sampleSwapTerms, executionPriceTicks: sampleSwapTerms.executionPriceTicks + 1n },
    { ...sampleSwapTerms, protocolFeeQuoteAtoms: sampleSwapTerms.protocolFeeQuoteAtoms + 1n },
    { ...sampleSwapTerms, maximumFeeBps: sampleSwapTerms.maximumFeeBps - 1n },
    { ...sampleSwapTerms, zcashLockScriptHash: hex20("b") },
    { ...sampleSwapTerms, zcashClaimPubKeyHash: hex20("7") },
    { ...sampleSwapTerms, zcashRefundPubKeyHash: hex20("8") },
    { ...sampleSwapTerms, evmFunder: hex20("7") },
    { ...sampleSwapTerms, evmClaimRecipient: hex20("8") },
    { ...sampleSwapTerms, evmRefundRecipient: hex20("9") },
    { ...sampleSwapTerms, evmEscrowContract: hex20("7") },
    { ...sampleSwapTerms, secretHash: keccak256Text("other-secret-hash") },
    { ...sampleSwapTerms, authorizationDeadline: sampleSwapTerms.authorizationDeadline - 1n },
    { ...sampleSwapTerms, zecFundBy: sampleSwapTerms.zecFundBy + 1n },
    { ...sampleSwapTerms, evmFundBy: sampleSwapTerms.evmFundBy + 1n },
    { ...sampleSwapTerms, evmClaimSafetyCutoff: sampleSwapTerms.evmClaimSafetyCutoff + 1n },
    { ...sampleSwapTerms, evmRefundTime: sampleSwapTerms.evmRefundTime + 1n },
    { ...sampleSwapTerms, zecRefundTime: sampleSwapTerms.zecRefundTime + 1n },
    { ...sampleSwapTerms, timeoutPolicyId: keccak256Text("other-timeout-policy") },
    { ...sampleSwapTerms, observerPolicyId: keccak256Text("other-observer-policy") },
    { ...sampleSwapTerms, zecFinalityPolicyId: keccak256Text("other-zec-finality") },
    { ...sampleSwapTerms, evmFinalityPolicyId: keccak256Text("other-evm-finality") },
  ];
  const baseline = hashSwapTerms(sampleSwapTerms);
  assert.equal(new Set(mutations.map(hashSwapTerms)).size, mutations.length);
  for (const mutation of mutations) assert.notEqual(hashSwapTerms(mutation), baseline);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, version: 2 as 1 }), /Unsupported/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, zecAsset: `${sampleSwapTerms.zecChain}/slip44:999` }), /slip44:133/);
});

test("rejects wrong assets, destinations, contracts, and amounts without mutation", () => {
  const zecPrepared = prepareSwapFunding(
    authorizedSwap(),
    "zec",
    keccak256Text("zec-artifact"),
    sampleSwapTerms.zecFundBy - 1n,
  );
  const root = swapStateRoot(zecPrepared);
  for (const changed of [
    { ...fundingEvidence("zec"), asset: `${sampleSwapTerms.zecChain}/slip44:999` },
    { ...fundingEvidence("zec"), recipient: hex20("9") },
    { ...fundingEvidence("zec"), lockIdentity: hex20("9") },
    { ...fundingEvidence("zec"), amountAtoms: sampleSwapTerms.zecAmountZatoshis - 1n },
  ]) {
    assert.throws(() => observeSwapFunding(zecPrepared, changed), /does not match/);
    assert.equal(swapStateRoot(zecPrepared), root);
  }
});

test("treats refund eligibility as derived, not a terminal spend", () => {
  const bothFunded = fundedSwap();
  assert.equal(swapDeadlineStatus(sampleSwapTerms, sampleSwapTerms.zecRefundTime).zecRefundEligible, true);
  assert.equal(bothFunded.zec.phase, "funded-confirmed");
  assert.equal(bothFunded.evm.phase, "funded-confirmed");
});

test("rejects wrong preimages and keeps the funded state byte-identical", () => {
  const terms = { ...sampleSwapTerms, secretHash: fixtureSecretHash };
  const bothFunded = fundedSwap(terms);
  const root = swapStateRoot(bothFunded);
  assert.throws(() => observeSwapSpend(bothFunded, {
    ...spendEvidence("evm", "claim", terms.evmRefundTime - 1n, terms),
    preimage: `0x${"12".repeat(32)}`,
  }), /hashlock/);
  assert.equal(swapStateRoot(bothFunded), root);
});

test("rejects conflicting replacement evidence in an occupied journal slot", () => {
  const initial = authorizedSwap();
  const prepared = prepareSwapFunding(initial, "zec", keccak256Text("zec-artifact"), sampleSwapTerms.zecFundBy - 1n);
  const journal = emptySwapJournal(prepared);
  const firstEvidence = fundingEvidence("zec");
  const first = appendSwapEvent(journal, prepared, { kind: "observe-funding", evidence: firstEvidence });
  assert.throws(() => appendSwapEvent(first.journal, first.state, {
    kind: "observe-funding",
    evidence: { ...firstEvidence, evidenceId: keccak256Text("replacement"), blockHash: keccak256Text("replacement-block") },
  }), /semantic slot/);
});
