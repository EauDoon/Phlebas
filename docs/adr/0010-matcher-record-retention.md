# ADR 0010: What the matcher may forget

Status: Proposed. Not accepted, not implemented.

This ADR exists because two defects recorded in `docs/audit/open-items.md`,
`review-1` and `review-8`, cannot be fixed without answering one question
that no document currently answers: **which records may the matcher drop,
and what does dropping them do to the identity of a replayed journal?**

Both were reproduced. Neither was fixed, because `CONTRIBUTING.md` puts a
change that alters a public surface behind an architecture decision, and
choosing a retention policy is that kind of change rather than a local
repair. This is the decision, written up so it can be accepted, rejected
or amended rather than deferred again.

## The two symptoms

### review-1: the accepted-order cap is a lifetime quota

`applyOrderAcceptance` in `src/lib/persistent-matcher.ts` refuses an order
once `Object.keys(state.orderReference.acceptedOrders).length` reaches
`limits.maximumAcceptedOrders`. `acceptOrderIntent` in
`src/lib/order-reference.ts` inserts every accepted order into that record
and nothing anywhere removes one, including orders that filled, cancelled,
expired, or were rejected by their own time-in-force.

So the limit does not bound how many orders are live. It bounds how many
orders the market will ever accept. At the tracked configuration that
number is 1000. Once reached, the market accepts nothing further, and
because the condition is rebuilt by journal replay it survives restart.

`openOrders`, sitting beside it in the same state, *is* pruned on fill,
cancel, epoch advance and expiry. The asymmetry reads as an omission
rather than an intent.

### review-8: appending to the journal is quadratic

`services/matcher/persistent-store.ts` rebuilds the whole record array on
every mutation with `[...this.#journal.records, record]`. Appending is
therefore O(n) and a store's lifetime cost is O(n squared), against a
`DEFAULT_MAX_JOURNAL_RECORDS` of 100,000. Measured in isolation, appending
2,000 records takes 6.8ms from empty, 664.7ms from 40,000 existing, and
1,214.9ms from 90,000. Every accepted order pays it.

## Why they are one decision

Both are the same shape: an in-memory structure that only grows, whose
contents are load-bearing for replay.

The obvious fixes are cheap in isolation and both change what a caller
sees. Pruning `acceptedOrders` changes `matcherStateRoot`, because
`persistent-matcher.ts` derives the root from the sorted accepted-order
keys, so a pruned store and an unpruned one replaying the same journal
would disagree about the state root. Appending in place instead of copying
changes what a caller holding an older `store.journal` reference observes
after a later `mutate()`; `services/matcher/server.ts` and several tests
read `store.journal.records` as though it were a snapshot.

Neither is a performance tweak. Both are changes to what the matcher
promises about its own memory.

## Options

### A. Keep everything, raise the ceilings

Accept unbounded growth and configure the caps high enough that no real
session reaches them. Nothing about replay identity changes.

Rejects the premise: the quadratic cost still grows, and a market that
stops at a higher number still stops.

### B. Prune terminal orders, and version the state root

Drop an accepted order once it is terminal and no longer referenced by an
open order, a cancelled nonce, or an unclaimed execution. Introduce a
state-root version so a pruned store is not silently compared against an
unpruned one.

This is the honest fix for review-1, and it is the expensive one: it needs
a definition of "no longer referenced" that account recovery and execution
lookup both agree with, and it makes the state root a versioned artifact
with a migration.

### C. Separate the live index from the durable log

Keep the journal append-only and complete, and derive a bounded live index
from it. The cap then applies to the index, which is what "how many orders
can be open" should have meant, and the journal keeps every record for
replay. Appending to a log that nothing re-copies is O(1).

Costs a second structure and the code that keeps the two consistent.

### D. Fix only the aliasing, defer the quota

Change the journal to append in place with an explicitly documented live
reference, leaving `acceptedOrders` alone. Removes the quadratic cost
without touching the state root.

Smaller, and leaves review-1 open. Worth considering if the quota is
judged acceptable for a no-value preview.

## Recommendation

**C for the journal, B for the accepted orders**, in that order, as two
separate changes with the journal first. C is contained and buys the
larger measured win. B needs the reference analysis and a state-root
version, and should not be rushed into the same change.

D is the acceptable fallback if only one can be taken.

## What this ADR does not do

It does not authorize any of it. Nothing in `docs/audit/open-items.md`
moves on the strength of a proposal, and the release gates are unchanged.
`review-1` and `review-8` stay open until an option here is accepted and
the work is reviewed against exact bytes.
