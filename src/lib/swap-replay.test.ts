import assert from "node:assert/strict";
import test from "node:test";

import { keccak256Text } from "./keccak.ts";
import { sampleEvidencePolicies, sampleMarketPolicy, sampleSwapTerms, sampleTimingPolicy } from "./swap-test-fixtures.ts";
import { appendSwapEvent, emptySwapJournal, type SwapJournal } from "./swap-journal.ts";
import { createSwapSnapshot, replaySwapJournal, restoreSwapSnapshot, verifySwapSnapshot } from "./swap-replay.ts";
import { swapStateRoot } from "./swap-root.ts";
import { createSwapState } from "./swap-state.ts";

function authorizedJournal() {
  const initial = createSwapState(sampleSwapTerms, sampleTimingPolicy, sampleEvidencePolicies, sampleMarketPolicy);
  const empty = emptySwapJournal(initial);
  const first = appendSwapEvent(empty, initial, {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.zecSellerId,
    termsHash: initial.termsHash,
    occurredAtSeconds: 1n,
  });
  const second = appendSwapEvent(first.journal, first.state, {
    kind: "authorize-terms",
    partyId: sampleSwapTerms.stablecoinSellerId,
    termsHash: initial.termsHash,
    occurredAtSeconds: 2n,
  });
  return { initial, expected: second.state, journal: second.journal };
}

test("replays a journal to the identical state root", () => {
  const fixture = authorizedJournal();
  const replayed = replaySwapJournal(fixture.initial, fixture.journal);
  assert.deepEqual(replayed, fixture.expected);
  assert.equal(swapStateRoot(replayed), swapStateRoot(fixture.expected));
});

test("creates and restores a digest-bound complete snapshot", () => {
  const fixture = authorizedJournal();
  const snapshot = createSwapSnapshot(fixture.initial, fixture.journal);
  assert.equal(verifySwapSnapshot(fixture.initial, fixture.journal, snapshot), true);
  assert.deepEqual(restoreSwapSnapshot(fixture.initial, fixture.journal, snapshot), fixture.expected);
  assert.equal(verifySwapSnapshot(fixture.initial, fixture.journal, { ...snapshot, stateRoot: keccak256Text("wrong") }), false);
  assert.equal(verifySwapSnapshot(fixture.initial, fixture.journal, { ...snapshot, nextSequence: 99n }), false);
});

test("fails closed on truncated and state-root-mismatched journals", () => {
  const fixture = authorizedJournal();
  const truncated: SwapJournal = {
    ...fixture.journal,
    receipts: fixture.journal.receipts.slice(0, 1),
  };
  assert.throws(() => replaySwapJournal(fixture.initial, truncated), /invalid/);

  const last = fixture.journal.receipts.at(-1)!;
  const corrupt: SwapJournal = {
    ...fixture.journal,
    receipts: [
      ...fixture.journal.receipts.slice(0, -1),
      { ...last, nextStateRoot: keccak256Text("wrong") },
    ],
  };
  assert.throws(() => replaySwapJournal(fixture.initial, corrupt), /invalid|state root/);
});

test("refuses an advanced state that is not represented by the journal", () => {
  const fixture = authorizedJournal();
  assert.throws(() => appendSwapEvent(emptySwapJournal(fixture.initial), fixture.expected, {
    kind: "prepare-funding",
    leg: "zec",
    artifactHash: keccak256Text("artifact"),
    occurredAtSeconds: 3n,
  }), /does not match the journal head/);
});
