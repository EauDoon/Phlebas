import assert from "node:assert/strict";
import test from "node:test";
import { keccak256Text } from "../../src/lib/keccak.ts";
import { appendSwapEvent, emptySwapJournal, type SwapEventPayload } from "../../src/lib/swap-journal.ts";
import { replaySwapJournal } from "../../src/lib/swap-replay.ts";
import { swapStateRoot } from "../../src/lib/swap-root.ts";
import { createSwapState, fundingFactId } from "../../src/lib/swap-state.ts";
import {
  fixtureSecretHash, fundingEvidence, sampleEvidencePolicies, sampleMarketPolicy,
  sampleSwapTerms, sampleTimingPolicy, spendEvidence,
} from "../../src/lib/swap-test-fixtures.ts";
import { ingestSwapEvidence } from "./evidence.ts";

type Observation = Parameters<typeof ingestSwapEvidence>[3];
const terms = { ...sampleSwapTerms, secretHash: fixtureSecretHash };

function preparedJournal(confirmBoth = false) {
  const state = createSwapState(terms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy);
  let current = { state, journal: emptySwapJournal(state) };
  const append = (payload: SwapEventPayload) => {
    current = appendSwapEvent(current.journal, current.state, payload);
  };
  for (const partyId of [terms.zecSellerId, terms.stablecoinSellerId]) {
    append({ kind: "authorize-terms", partyId, termsHash: state.termsHash, occurredAtSeconds: terms.authorizationDeadline - 1n });
  }
  for (const leg of (confirmBoth ? ["zec", "evm"] : ["zec"]) as ("zec" | "evm")[]) {
    append({
      kind: "prepare-funding", leg, artifactHash: keccak256Text(`observer-${leg}-artifact`),
      occurredAtSeconds: (leg === "zec" ? terms.zecFundBy : terms.evmFundBy) - 1n,
    });
    if (!confirmBoth) break;
    for (const source of [0, 1] as const) {
      current = ingest(current, { kind: "observe-funding", evidence: fundingEvidence(leg, "1", terms, source) });
    }
    const evidence = fundingEvidence(leg, "1", terms);
    append({ kind: "confirm-funding", leg, factId: evidence.fact.factId, qualifiedAtSeconds: evidence.attestation.observedAtSeconds });
  }
  return current;
}

function ingest(current: ReturnType<typeof preparedJournal>, payload: Observation) {
  return ingestSwapEvidence(current.journal, current.journal.head, swapStateRoot(current.state), payload);
}

test("observer funding quorum remains unconfirmed and replays deterministically", () => {
  const initial = preparedJournal();
  const first = ingest(initial, { kind: "observe-funding", evidence: fundingEvidence("zec", "1", terms, 0) });
  const second = ingest(first, { kind: "observe-funding", evidence: fundingEvidence("zec", "1", terms, 1) });
  assert.equal(second.state.zec.phase, "funding-seen");
  assert.equal(second.state.zec.fundingConfirmedAtSeconds, undefined);
  assert.equal(second.state.evm.phase, "unfunded");
  assert.deepEqual(second.state.authorizations, initial.state.authorizations);
  assert.deepEqual(replaySwapJournal(second.journal.initialState, structuredClone(second.journal)), second.state);
  assert.deepEqual(ingest(initial, { kind: "observe-funding", evidence: fundingEvidence("zec", "1", terms, 0) }), first);
});

test("observer retries require the current head and root even for an exact duplicate", () => {
  const initial = preparedJournal();
  const payload: Observation = { kind: "observe-funding", evidence: fundingEvidence("zec", "1", terms) };
  const accepted = ingest(initial, payload);
  assert.throws(() => ingestSwapEvidence(accepted.journal, initial.journal.head, swapStateRoot(accepted.state), payload), /head is stale/);
  assert.throws(() => ingestSwapEvidence(accepted.journal, accepted.journal.head, swapStateRoot(initial.state), payload), /state root/);
  const retry = ingest(accepted, payload);
  assert.equal(retry.appended, false);
  assert.deepEqual(retry.receipt, accepted.receipt);
  assert.deepEqual(retry.journal, accepted.journal);
});

test("observer rejects semantic-slot conflicts without changing accepted history", () => {
  const accepted = ingest(preparedJournal(), { kind: "observe-funding", evidence: fundingEvidence("zec", "1", terms) });
  const changed = fundingEvidence("zec", "1", terms);
  const before = structuredClone(accepted.journal);
  assert.throws(() => ingest(accepted, {
    kind: "observe-funding",
    evidence: { ...changed, attestation: { ...changed.attestation, evidenceId: keccak256Text("different-observation") } },
  }), /same semantic slot/);
  assert.deepEqual(accepted.journal, before);
});

test("observer rejects malformed, wrong-term and unapproved-source evidence", () => {
  const initial = preparedJournal();
  const evidence = fundingEvidence("zec", "1", terms);
  const wrongFact = { ...evidence.fact, amountAtoms: evidence.fact.amountAtoms + 1n };
  wrongFact.factId = fundingFactId(wrongFact);
  const badPayloads = [
    { kind: "observe-funding", evidence, confirmed: true },
    { kind: "observe-funding", evidence: { ...evidence, diagnostic: true } },
    { kind: "observe-funding", evidence: { ...evidence, fact: { ...evidence.fact, unexpected: true } } },
    { kind: "observe-funding", evidence: { ...evidence, fact: wrongFact, attestation: { ...evidence.attestation, factId: wrongFact.factId } } },
    { kind: "observe-funding", evidence: { ...evidence, attestation: { ...evidence.attestation, sourceId: keccak256Text("unapproved") } } },
  ];
  for (const payload of badPayloads) assert.throws(() => ingest(initial, payload as Observation), /unknown fields|amountAtoms|not approved/);
  assert.equal(initial.journal.receipts.length, 3);
});

test("observer cannot authorize, prepare, confirm, resolve or ingest legacy projections", () => {
  const initial = preparedJournal();
  for (const kind of ["authorize-terms", "prepare-funding", "confirm-funding", "confirm-spend", "replace-funding-attestation", "evm-leg-funded"]) {
    assert.throws(() => ingest(initial, { kind } as Observation), /only funding or spend observations/);
  }
  const pristine = { state: initial.journal.initialState, journal: emptySwapJournal(initial.journal.initialState) };
  assert.throws(() => ingest(pristine, { kind: "observe-funding", evidence: fundingEvidence("zec", "1", terms) }), /prepared artifact/);
});

test("observer rejects corrupted and truncated journals before ingestion", () => {
  const initial = preparedJournal();
  const payload: Observation = { kind: "observe-funding", evidence: fundingEvidence("zec", "1", terms) };
  for (const journal of [
    { ...initial.journal, receipts: initial.journal.receipts.slice(1) },
    { ...initial.journal, nextSequence: initial.journal.nextSequence + 1n },
  ]) assert.throws(() => ingestSwapEvidence(journal, journal.head, swapStateRoot(initial.state), payload), /journal is invalid/);
});

test("observer chain-view disagreement stays journaled and disputed after restart", () => {
  const first = ingest(preparedJournal(), { kind: "observe-funding", evidence: fundingEvidence("zec", "1", terms, 0) });
  const second = fundingEvidence("zec", "1", terms, 1);
  const disputed = ingest(first, {
    kind: "observe-funding", evidence: { ...second, attestation: { ...second.attestation, tipBlockHash: keccak256Text("conflicting-tip") } },
  });
  assert.equal(disputed.state.disputes[0]?.reason, "observer-conflict");
  assert.deepEqual(replaySwapJournal(disputed.journal.initialState, disputed.journal), disputed.state);
  assert.equal(disputed.state.zec.fundingConfirmedAtSeconds, undefined);
});

test("observer claim and refund facts never confirm a spend or secret automatically", () => {
  const funded = preparedJournal(true);
  const claimed = ingest(funded, { kind: "observe-spend", evidence: spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff, terms) });
  assert.equal(claimed.state.evm.phase, "claim-seen");
  assert.equal(claimed.state.observedSecret, spendEvidence("evm", "claim", terms.evmClaimSafetyCutoff, terms).fact.preimage);
  assert.equal(claimed.state.confirmedSecret, undefined);
  assert.deepEqual(replaySwapJournal(claimed.journal.initialState, claimed.journal), claimed.state);
  assert.throws(() => ingest(claimed, { kind: "observe-spend", evidence: spendEvidence("zec", "claim", terms.evmClaimSafetyCutoff, terms) }), /policy-confirmed EVM claim/);
  for (const leg of ["zec", "evm"] as const) {
    const deadline = leg === "zec" ? terms.zecRefundTime : terms.evmRefundTime;
    const refunded = ingest(funded, { kind: "observe-spend", evidence: spendEvidence(leg, "refund", deadline, terms) });
    assert.equal(refunded.state[leg].phase, "refund-seen");
    assert.equal(refunded.state[leg].spendConfirmedAtSeconds, undefined);
  }
});

test("accepted observer payloads cannot be mutated through source or receipt aliases", () => {
  const evidence = fundingEvidence("zec", "1", terms);
  const payload: Observation = { kind: "observe-funding", evidence };
  const accepted = ingest(preparedJournal(), payload);
  Object.assign(evidence.fact, { amountAtoms: 1n });
  Object.assign(evidence.attestation, { sourceId: keccak256Text("changed-after-ingestion") });
  const stored = accepted.receipt.payload as Observation;
  assert.throws(() => Object.assign(stored.evidence.fact, { amountAtoms: 1n }), TypeError);
  assert.throws(() => Object.assign(stored.evidence.attestation, { tipBlockHeight: 0n }), TypeError);
  assert.deepEqual(replaySwapJournal(accepted.journal.initialState, accepted.journal), accepted.state);
});

test("duplicate ingestion owns and freezes rehydrated receipt history", () => {
  const initial = preparedJournal();
  const payload: Observation = { kind: "observe-funding", evidence: fundingEvidence("zec", "1", terms) };
  const mutable = structuredClone(appendSwapEvent(initial.journal, initial.state, payload));
  const retry = ingest(mutable, payload);
  assert.equal(retry.appended, false);
  const stored = retry.receipt.payload as Observation;
  assert.throws(() => Object.assign(stored.evidence.fact, { amountAtoms: 1n }), TypeError);
  assert.throws(() => Object.assign(retry.journal.receipts[0]!.payload, { occurredAtSeconds: 0n }), TypeError);
  Object.assign((mutable.receipt.payload as Observation).evidence.fact, { amountAtoms: 1n });
  assert.equal(stored.evidence.fact.amountAtoms, payload.evidence.fact.amountAtoms);
  assert.deepEqual(replaySwapJournal(retry.journal.initialState, retry.journal), retry.state);
});
