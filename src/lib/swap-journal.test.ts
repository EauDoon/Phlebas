import assert from "node:assert/strict";
import test from "node:test";

import { keccak256Text } from "./keccak.ts";
import {
  authorizedSwap,
  fundingEvidence,
  sampleEvidencePolicies,
  sampleMarketPolicy,
  sampleSwapTerms,
  sampleTimingPolicy,
} from "./swap-test-fixtures.ts";
import {
  appendSwapEvent,
  emptySwapJournal,
  hashSwapEventPayload,
  verifySwapJournal,
  type SwapEventPayload,
} from "./swap-journal.ts";
import { createSwapState, prepareSwapFunding } from "./swap-state.ts";

function fixture() {
  const state = createSwapState(sampleSwapTerms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy);
  return { state, journal: emptySwapJournal(state) };
}

test("chains deterministic swap event receipts", () => {
  const initial = fixture();
  const firstPayload: SwapEventPayload = {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: 1n,
  };
  const first = appendSwapEvent(initial.journal, initial.state, firstPayload);
  const second = appendSwapEvent(first.journal, first.state, {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.stablecoinSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: 2n,
  });
  assert.equal(second.receipt.sequence, 2n);
  assert.equal(second.receipt.previousEventHash, first.receipt.eventHash);
  assert.equal(second.journal.head, second.receipt.eventHash);
  assert.equal(verifySwapJournal(second.journal), true);
});

test("makes exact duplicate payloads idempotent", () => {
  const initial = fixture();
  const payload: SwapEventPayload = {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: 1n,
  };
  const appended = appendSwapEvent(initial.journal, initial.state, payload);
  const duplicate = appendSwapEvent(appended.journal, appended.state, structuredClone(payload));
  assert.equal(duplicate.appended, false);
  assert.equal(duplicate.journal, appended.journal);
  assert.equal(duplicate.state, appended.state);
});

test("rejects conflicting content in the same semantic slot", () => {
  const initial = fixture();
  const first = appendSwapEvent(initial.journal, initial.state, {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: 1n,
  });
  assert.throws(() => appendSwapEvent(first.journal, first.state, {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: 2n,
  }), /semantic slot/);
});

test("detects receipt payload, hash-chain, and sequence corruption", () => {
  const initial = fixture();
  const appended = appendSwapEvent(initial.journal, initial.state, {
    kind: "flag-dispute",
    reason: "observer-stale",
    detail: "Fixture observer is stale",
  });
  assert.equal(verifySwapJournal(appended.journal), true);
  assert.equal(verifySwapJournal({ ...appended.journal, head: keccak256Text("wrong") }), false);
  assert.equal(verifySwapJournal({
    ...appended.journal,
    receipts: [{ ...appended.receipt, sequence: 2n }],
  }), false);
  assert.equal(verifySwapJournal({
    ...appended.journal,
    receipts: [{ ...appended.receipt, payload: { ...appended.receipt.payload, detail: "Changed" } as SwapEventPayload }],
  }), false);
});

test("forbids JavaScript numbers inside hashed journal payloads", () => {
  const evidence = fundingEvidence("zec");
  assert.throws(() => hashSwapEventPayload({
    kind: "observe-funding",
    evidence: { ...evidence, fact: { ...evidence.fact, blockHeight: 1 as unknown as bigint } },
  }), /numbers are forbidden/);
});

test("rejects missing, extra, and undefined runtime payload fields", () => {
  const evidence = fundingEvidence("zec");
  assert.throws(() => hashSwapEventPayload({
    kind: "observe-funding",
    evidence: { ...evidence, unexpected: true },
  } as unknown as SwapEventPayload), /unknown fields/);
  assert.throws(() => hashSwapEventPayload({
    kind: "observe-funding",
    evidence: { ...evidence, fact: { ...evidence.fact, unexpected: true } },
  } as unknown as SwapEventPayload), /unknown fields/);
  assert.throws(() => hashSwapEventPayload({
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: sampleSwapTerms.zecOrderHash,
  } as unknown as SwapEventPayload), /missing required fields/);
  assert.throws(() => hashSwapEventPayload({
    kind: "flag-dispute",
    reason: "observer-stale",
    detail: "Undefined is not canonical",
    evidenceId: undefined,
  }), /undefined/);
});

test("rejects unknown payload kinds and histories that cannot replay", () => {
  const initial = fixture();
  const appended = appendSwapEvent(initial.journal, initial.state, {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initial.state.termsHash,
    occurredAtSeconds: 1n,
  });
  const unknownHistory = {
    ...appended.journal,
    receipts: [{ ...appended.receipt, payload: { kind: "future-unknown" } as unknown as SwapEventPayload }],
  };
  assert.equal(verifySwapJournal(unknownHistory), false);
  assert.throws(
    () => appendSwapEvent(unknownHistory, appended.state, {
      kind: "flag-dispute",
      reason: "observer-stale",
      detail: "History must replay before append",
    }),
    /invalid swap journal/,
  );

  const unreplayable = {
    ...appended.journal,
    initialState: { ...initial.state, termsHash: keccak256Text("wrong") },
  };
  assert.equal(verifySwapJournal(unreplayable), false);
});

test("journals two independent observers that agree on one funding fact", () => {
  const prepared = prepareSwapFunding(
    authorizedSwap(),
    "zec",
    keccak256Text("two-observer-artifact"),
    sampleSwapTerms.zecFundBy - 1n,
  );
  const empty = emptySwapJournal(prepared);
  const first = appendSwapEvent(empty, prepared, {
    kind: "observe-funding",
    evidence: fundingEvidence("zec", "1", sampleSwapTerms, 0),
  });
  const second = appendSwapEvent(first.journal, first.state, {
    kind: "observe-funding",
    evidence: fundingEvidence("zec", "1", sampleSwapTerms, 1),
  });
  assert.equal(second.state.zec.fundingAttestations?.length, 2);
  assert.equal(verifySwapJournal(second.journal), true);
});
