import assert from "node:assert/strict";
import test from "node:test";

import { keccak256Text } from "./keccak.ts";
import { deriveSwapFillId, hashSwapTerms, validateSwapTerms, type SwapTermsV1 } from "./swap-domain.ts";
import { appendSwapEvent, emptySwapJournal } from "./swap-journal.ts";
import { swapDeadlineStatus } from "./swap-policy.ts";
import { swapStateRoot } from "./swap-root.ts";
import {
  authorizedSwap,
  fixtureSecretHash,
  fundedSwap,
  fundingEvidence,
  hex20,
  sampleEvidencePolicies,
  sampleMarketPolicy,
  sampleSwapTerms,
  spendEvidence,
} from "./swap-test-fixtures.ts";
import {
  authorizeSwapTerms,
  confirmSwapFunding,
  createSwapState,
  fundingFactId,
  observeSwapFunding,
  observeSwapSpend,
  prepareSwapFunding,
  spendFactId,
  type FundingEvidence,
  type SpendEvidence,
} from "./swap-state.ts";

function replaceFundingFact(
  evidence: FundingEvidence,
  changes: Partial<Omit<FundingEvidence["fact"], "factId">>,
): FundingEvidence {
  const { factId: _factId, ...current } = evidence.fact;
  void _factId;
  const unsigned = { ...current, ...changes };
  const factId = fundingFactId(unsigned);
  return { ...evidence, fact: { factId, ...unsigned }, attestation: { ...evidence.attestation, factId } };
}

function replaceSpendFact(
  evidence: SpendEvidence,
  changes: Partial<Omit<SpendEvidence["fact"], "factId">>,
): SpendEvidence {
  const { factId: _factId, ...current } = evidence.fact;
  void _factId;
  const unsigned = { ...current, ...changes };
  const factId = spendFactId(unsigned);
  return { ...evidence, fact: { factId, ...unsigned }, attestation: { ...evidence.attestation, factId } };
}

test("binds canonical terms into every state root and transition", () => {
  const initial = createSwapState(sampleSwapTerms, {
    minimumFundingWindowSeconds: 100n,
    minimumClaimWindowSeconds: 100n,
    minimumSafetyWindowSeconds: 500n,
  }, sampleEvidencePolicies, sampleMarketPolicy);
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

test("rejects prototype-backed authorization records", () => {
  const initial = createSwapState(sampleSwapTerms, {
    minimumFundingWindowSeconds: 100n,
    minimumClaimWindowSeconds: 100n,
    minimumSafetyWindowSeconds: 500n,
  }, sampleEvidencePolicies, sampleMarketPolicy);
  const inherited = Object.create({
    "zec-seller": sampleSwapTerms.authorizationDeadline - 2n,
    "stablecoin-seller": sampleSwapTerms.authorizationDeadline - 1n,
  }) as typeof initial.authorizations;
  const forged = { ...initial, authorizations: inherited };
  assert.throws(() => swapStateRoot(forged), /plain canonical record/);
  assert.throws(() => emptySwapJournal(forged), /plain canonical record/);
});

test("binds timing, market, observer, and finality policies into state integrity", () => {
  const state = authorizedSwap();
  assert.throws(
    () => swapStateRoot({
      ...state,
      timingPolicy: { ...state.timingPolicy, minimumFundingWindowSeconds: 101n },
    }),
    /Timing policy does not match signed terms/,
  );
  assert.throws(
    () => swapStateRoot({
      ...state,
      marketPolicy: {
        ...state.marketPolicy,
        markets: [{ ...state.marketPolicy.markets[0]!, quoteAsset: `${state.terms.quoteChain}/erc20:${hex20("9")}` }],
      },
    }),
    /Market policy does not match signed terms/,
  );
  assert.throws(
    () => swapStateRoot({
      ...state,
      evidencePolicies: {
        ...state.evidencePolicies,
        observer: { ...state.evidencePolicies.observer, maxObservationDelaySeconds: 601n },
      },
    }),
    /Observer policy does not match signed terms/,
  );
  assert.throws(
    () => swapStateRoot({
      ...state,
      evidencePolicies: {
        ...state.evidencePolicies,
        evmFinality: { ...state.evidencePolicies.evmFinality, minimumConfirmations: 21n },
      },
    }),
    /EVM finality policy does not match signed terms/,
  );
});

test("uses chain execution time while treating late observer arrival as metadata", () => {
  const terms = { ...sampleSwapTerms, secretHash: fixtureSecretHash };
  const funded = fundedSwap(terms);
  const baseClaim = spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff, terms);
  const claim = {
    ...baseClaim,
    attestation: {
      ...baseClaim.attestation,
      observedAtSeconds: terms.evmRefundTime + 1n,
    },
  };
  assert.ok(claim.attestation.observedAtSeconds > terms.evmRefundTime);
  const observed = observeSwapSpend(funded, claim);
  assert.equal(observed.observedSecret, claim.fact.preimage);

  const prepared = prepareSwapFunding(
    authorizedSwap(terms),
    "zec",
    keccak256Text("late-funding-artifact"),
    terms.zecFundBy - 1n,
  );
  const lateFunding = replaceFundingFact(fundingEvidence("zec", "1", terms), {
    executedAtSeconds: terms.zecFundBy,
  });
  assert.throws(() => observeSwapFunding(prepared, lateFunding), /signed cutoff/);
});

test("binds spends to the exact funded outpoint or escrow record", () => {
  const terms = { ...sampleSwapTerms, secretHash: fixtureSecretHash };
  const funded = fundedSwap(terms);
  const claim = spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff, terms);
  for (const changed of [
    replaceSpendFact(claim, { fundingFactId: keccak256Text("other-funding-fact") }),
    replaceSpendFact(claim, { fundingTransactionId: keccak256Text("other-funding-transaction") }),
    replaceSpendFact(claim, { fundingOutputIndex: 1n }),
    replaceSpendFact(claim, { lockIdentity: hex20("9") }),
    replaceSpendFact(claim, { escrowRecordId: keccak256Text("other-escrow-record") }),
    replaceSpendFact(claim, { asset: `${terms.quoteChain}/erc20:${hex20("9")}` }),
    replaceSpendFact(claim, { amountAtoms: terms.quoteAmountAtoms - 1n }),
  ]) {
    assert.throws(() => observeSwapSpend(funded, changed), /funded outpoint or escrow record/);
  }
});

test("rejects chain facts that predate their causal prerequisites", () => {
  const prepared = prepareSwapFunding(
    authorizedSwap(),
    "zec",
    keccak256Text("chronology-artifact"),
    sampleSwapTerms.zecFundBy - 1n,
  );
  const prematureFunding = replaceFundingFact(fundingEvidence("zec"), {
    executedAtSeconds: sampleSwapTerms.zecFundBy - 2n,
  });
  assert.throws(() => observeSwapFunding(prepared, prematureFunding), /prepared artifact/);

  const terms = { ...sampleSwapTerms, secretHash: fixtureSecretHash };
  const funded = fundedSwap(terms);
  const prematureClaim = replaceSpendFact(
    spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff, terms),
    { executedAtSeconds: funded.evm.funding!.executedAtSeconds - 1n },
  );
  assert.throws(() => observeSwapSpend(funded, prematureClaim), /cannot predate/);
});

test("requires approved fresh observers and policy-qualified finality", () => {
  const prepared = prepareSwapFunding(
    authorizedSwap(),
    "zec",
    keccak256Text("observer-policy-artifact"),
    sampleSwapTerms.zecFundBy - 1n,
  );
  const first = fundingEvidence("zec", "1", sampleSwapTerms, 0);
  assert.throws(
    () => observeSwapFunding(prepared, {
      ...first,
      attestation: { ...first.attestation, finalityPolicyId: sampleSwapTerms.evmFinalityPolicyId },
    }),
    /Finality policy/,
  );
  assert.throws(
    () => observeSwapFunding(prepared, {
      ...first,
      attestation: {
        ...first.attestation,
        observedAtSeconds: first.fact.executedAtSeconds + sampleEvidencePolicies.observer.maxObservationDelaySeconds + 1n,
      },
    }),
    /stale/,
  );

  const shallowFirst = {
    ...first,
    attestation: { ...first.attestation, tipBlockHeight: first.fact.blockHeight },
  };
  const second = fundingEvidence("zec", "1", sampleSwapTerms, 1);
  const shallowSecond = {
    ...second,
    attestation: { ...second.attestation, tipBlockHeight: second.fact.blockHeight },
  };
  const observed = observeSwapFunding(observeSwapFunding(prepared, shallowFirst), shallowSecond);
  assert.throws(
    () => confirmSwapFunding(observed, "zec", first.fact.factId, second.attestation.observedAtSeconds),
    /quorum and finality/,
  );
});

test("binds every mutable signed term to the terms digest", () => {
  const withFill = (changes: Partial<SwapTermsV1>): SwapTermsV1 => {
    const next = { ...sampleSwapTerms, ...changes };
    return { ...next, fillId: deriveSwapFillId(next) };
  };
  const mutations: readonly SwapTermsV1[] = [
    withFill({ fillIndex: 1n }),
    withFill({ zecOrderHash: keccak256Text("other-zec-order") }),
    withFill({ stablecoinOrderHash: keccak256Text("other-quote-order") }),
    { ...sampleSwapTerms, zecSellerId: keccak256Text("other-zec-seller") },
    { ...sampleSwapTerms, stablecoinSellerId: keccak256Text("other-quote-seller") },
    { ...sampleSwapTerms, zecChain: "bip122:11111111111111111111111111111111", zecAsset: "bip122:11111111111111111111111111111111/slip44:133" },
    { ...sampleSwapTerms, quoteChain: "eip155:1", quoteAsset: "eip155:1/erc20:0x1111111111111111111111111111111111111111" },
    { ...sampleSwapTerms, quoteAsset: `${sampleSwapTerms.quoteChain}/erc20:0x2222222222222222222222222222222222222222` },
    withFill({
      zecAmountZatoshis: sampleSwapTerms.zecAmountZatoshis + 10_000n,
      quoteAmountAtoms: sampleSwapTerms.quoteAmountAtoms + sampleSwapTerms.executionPriceTicks,
    }),
    withFill({
      quoteAmountAtoms: 52_920_000n,
      executionPriceTicks: sampleSwapTerms.executionPriceTicks + 1n,
    }),
    { ...sampleSwapTerms, feeRecipient: hex20("6") },
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
    { ...sampleSwapTerms, marketPolicyId: keccak256Text("other-market-policy") },
    { ...sampleSwapTerms, observerPolicyId: keccak256Text("other-observer-policy") },
    { ...sampleSwapTerms, zecFinalityPolicyId: keccak256Text("other-zec-finality") },
    { ...sampleSwapTerms, evmFinalityPolicyId: keccak256Text("other-evm-finality") },
  ];
  const baseline = hashSwapTerms(sampleSwapTerms);
  assert.equal(new Set(mutations.map(hashSwapTerms)).size, mutations.length);
  for (const mutation of mutations) assert.notEqual(hashSwapTerms(mutation), baseline);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, version: 2 as 1 }), /Unsupported/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, protocolFeeQuoteAtoms: 1n }), /fees remain disabled/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, zecAsset: `${sampleSwapTerms.zecChain}/slip44:999` }), /slip44:133/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, fillId: keccak256Text("other-fill") }), /canonical match fields/);
  assert.throws(() => validateSwapTerms({ ...sampleSwapTerms, quoteAmountAtoms: sampleSwapTerms.quoteAmountAtoms + 1n }), /reconcile/);
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
    replaceFundingFact(fundingEvidence("zec"), { asset: `${sampleSwapTerms.zecChain}/slip44:999` }),
    replaceFundingFact(fundingEvidence("zec"), { claimRecipient: hex20("9") }),
    replaceFundingFact(fundingEvidence("zec"), { lockIdentity: hex20("9") }),
    replaceFundingFact(fundingEvidence("zec"), { amountAtoms: sampleSwapTerms.zecAmountZatoshis - 1n }),
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
    ...replaceSpendFact(
      spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff, terms),
      { preimage: `0x${"12".repeat(32)}` },
    ),
  }), /hashlock/);
  assert.equal(swapStateRoot(bothFunded), root);
});

test("rejects conflicting replacement evidence in an occupied journal slot", () => {
  const initial = createSwapState(sampleSwapTerms, {
    minimumFundingWindowSeconds: 100n,
    minimumClaimWindowSeconds: 100n,
    minimumSafetyWindowSeconds: 500n,
  }, sampleEvidencePolicies, sampleMarketPolicy);
  const journal = emptySwapJournal(initial);
  const authorizedZec = appendSwapEvent(journal, initial, {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initial.termsHash,
    occurredAtSeconds: sampleSwapTerms.authorizationDeadline - 2n,
  });
  const authorizedBoth = appendSwapEvent(authorizedZec.journal, authorizedZec.state, {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.stablecoinSellerId,
    termsHash: initial.termsHash,
    occurredAtSeconds: sampleSwapTerms.authorizationDeadline - 1n,
  });
  const prepared = appendSwapEvent(authorizedBoth.journal, authorizedBoth.state, {
    kind: "prepare-funding",
    leg: "zec",
    artifactHash: keccak256Text("zec-artifact"),
    occurredAtSeconds: sampleSwapTerms.zecFundBy - 1n,
  });
  const firstEvidence = fundingEvidence("zec");
  const first = appendSwapEvent(prepared.journal, prepared.state, { kind: "observe-funding", evidence: firstEvidence });
  const replacement = replaceFundingFact(firstEvidence, { blockHash: keccak256Text("replacement-block") });
  assert.throws(() => appendSwapEvent(first.journal, first.state, {
    kind: "observe-funding",
    evidence: { ...replacement, attestation: { ...replacement.attestation, evidenceId: keccak256Text("replacement") } },
  }), /conflict/);
});
