# Audit open items

This file summarizes required checklist rows that are not yet `done`.
The canonical status remains `docs/audit/audit-checklist.md`.

| ID | Item | Blocker |
| --- | --- | --- |
| contracts-10 | Exact reviewed testnet deployment and verified manifest | separately approved RPC and deploy authority |
| contracts-11 | Independent contract and protocol security review | exact release artifact not frozen |
| services-9 | Strict Zcash spend, branch, witness, destination, and finality evidence | strict adapter integration and review |
| services-10 | Strict EVM chain, contract, ABI, receipt, and finality evidence | exact deployment and authoritative journal adapter |
| services-11 | Canonical signed matcher terms consumed by both legs | matcher-to-terms materialization and replayable participant signature evidence; the Zcash artifact leg now binds exact terms, confirmed funding, journal provenance, and PCZT review bytes |
| services-12 | Durable authoritative settlement journals | production storage and reorganization evidence |
| operations-7 | Production alert destination | approved routing configuration |
| operations-8 | Production metrics destination | approved metrics configuration |
| operations-9 | End-to-end testnet claim, refund, failure, and recovery evidence | exact deployment and compatible wallets |
| docs-6 | Exact release evidence pack publication | exact release process |
| docs-7 | Exact-commit Vercel preview and browser evidence | candidate artifact and deployment quota |
| keys-2 | Production deployment-key separation | production key-control design |
| keys-5 | Production wallet signing documentation | production wallet design |
| keys-6 | Independent signing and broadcast-path review | exact deployment and wallet artifact |
| compliance-1 | Legal approval of exchange model and jurisdictions | counsel review |
| compliance-2 | Approved access, disclosure, privacy, sanctions, and incident controls | legal decision and implementation evidence |

Completed service rate-limiting and undeployed-manifest controls remain
recorded in the canonical checklist. Closing one row cannot implicitly
close another row.

## Defects found by review and deliberately not fixed in place

Each of these is reproduced and understood. None is left open because it
is hard; each is left open because closing it is a design decision that
belongs to a review rather than to the change that found it.

| ID | Defect | Why it is not fixed here |
| --- | --- | --- |
| review-1 | `maximumAcceptedOrders` bounds a set that is only ever added to, so it is a lifetime quota rather than a live-capacity limit. `acceptOrderIntent` inserts every accepted order into `orderReference.acceptedOrders` and nothing removes one, including for orders that filled, cancelled, expired, or were rejected by their own time-in-force. Once the configured number of orders have ever been accepted, the market accepts no further order, and the condition is rebuilt by journal replay so it survives restart. At the tracked configuration that number is 1000. `openOrders` beside it *is* pruned on fill, cancel, epoch advance and expiry, so the omission looks like a gap rather than an intent. | `acceptedOrders` feeds `matcherStateRoot`, account recovery, and execution lookup. Deciding which orders may be forgotten, and when, changes the replay identity of the journal, so it needs a retention policy that a reviewer has agreed to rather than one chosen by the change that noticed the bug. |
| review-2 | Every request that reaches the matcher through the Next.js route arrives from one loopback socket, because `matcher-proxy.ts` forwards no client identity. With forwarded headers no longer trusted by default, all of those requests share one token bucket, so one busy caller can exhaust the limit for every other user. | The fix is a trusted-proxy arrangement: the proxy has to send a key it has itself established, and the matcher has to be configured to trust that specific hop. Which key, and on what deployment, is an operations decision. |
| review-3 | `detectAlerts` compares `nowSeconds - observedAt`, a duration in seconds, against `config.reorgDepth`, which everywhere else in the repository is a count of blocks. The reorg-recency alert therefore stops firing a few seconds after an observation instead of after a block-scaled window. The alert is diagnostic and drives no action. | Expressing the window correctly needs a per-chain block interval, and the repository has not chosen one. The two chains do not share it. |
| review-4 | `swap-state.ts` can only clear a dispute whose reason is `reorganization`, and only when it is the sole dispute on the swap. `observer-conflict`, `observer-stale` and `semantic-mismatch` have no resolution transition at all, so two approved observers disagreeing once leaves the coordinator permanently unable to observe or confirm anything further on that swap, refunds included. The wallet-controlled refund on the chain itself is unaffected. | This may well be the intended fail-closed behaviour. Adding a transition that clears a dispute is adding authority to the settlement state machine, which `CONTRIBUTING.md` puts behind an architecture decision and an independent review. |
| review-5 | `src/lib/order.ts` still exposes `calculatePreviewNotional` and the float worst-price path used by market orders, after the settled-amount preview moved to exact integers. | The worst-price rounding interacts with the signed order's own limit and with `worstPriceTicks` in `units.ts`; converting it is a separate change with its own tests. |
| review-8 | `persistent-store.ts:1169` rebuilds the whole journal record array on every mutation with `[...this.#journal.records, record]`, so appending is O(n) and a store's lifetime cost is O(n squared). Measured in isolation, appending 2,000 records takes 6.8ms from empty, 664.7ms from 40,000 existing, and 1,214.9ms from 90,000 existing, against a configured `DEFAULT_MAX_JOURNAL_RECORDS` of 100,000. Every accepted order pays this, and it grows for the life of the process. | `store.journal.records` is a live public getter that `server.ts:328` and several tests read as though it were an immutable snapshot. Appending in place to get amortised O(1) changes what a caller holding an older `store.journal` reference sees after a later `mutate()`, so the fix is an aliasing decision about a public surface rather than a local optimisation. |
