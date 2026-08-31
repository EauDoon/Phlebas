# ADR 0007: Public market data over the matcher operator

Date: 01-09-2026
Status: Accepted for key-independent development
Production status: Not approved

## Context

The matcher operator (`src/lib/matcher-operator.ts`) is the single
source of truth for the in-memory order book, the receipt history,
and the active market configuration. The frontend and the
analytics jobs need a public read-only surface over that operator
state: a 24-hour ticker, an aggregated order book depth, a recent
trades feed, and a list of supported markets. The endpoints must
be safe to expose to the public; they must not leak the operator's
internal sequence receipts, the maker addresses, or the
matcher's private state.

The existing matcher HTTP service already exposes `/health`,
`/sequence`, `/book`, and `/orders`. The `/book` endpoint returns
the full resting-order list, which is too verbose for the public
and exposes maker-side identifiers. The `/sequence` endpoint
returns the receipt history, which is similarly too verbose and
exposes the order digest. The new public surface must summarize
the operator state without leaking the per-order detail.

## Decision

The new public surface is four HTTP endpoints on the matcher
service, each backed by a pure function over the operator state:

1. `GET /ticker` returns a 24-hour ticker: best bid, best ask,
   mid, spread, last price, 24-hour high, 24-hour low, 24-hour
   volume (base and quote), and trade count.
2. `GET /trades?limit=N` returns the most recent N fills, walking
   the receipts in reverse. The default limit is 50; the maximum
   is 1000.
3. `GET /depth?levels=N` returns the top N aggregated price levels
   for bids and asks. The default is 20; the maximum is 200.
4. `GET /markets` returns the configured base asset, the list of
   supported quote assets, and the current lastTicks.

The new endpoints are read-only. They never accept input other
than the `limit` and `levels` query parameters, both of which are
validated as non-negative integers within a fixed bound. The
endpoints never reach out to the chain clients; they derive every
field from the in-memory operator state. The endpoints never sign
a transaction.

The pure functions live in `src/lib/market-data.ts` alongside the
existing paper-trading fixtures. The fixtures are a no-value
simulation; the new pure functions operate on the live operator
state. The two surfaces never share data; the fixtures stay
frozen until a real Sepolia deployment is recorded.

The matcher service is a long-lived process. The endpoints read
the operator state at request time. The endpoint latency is
bounded by the operator's in-memory state size; for an operator
with fewer than 1_000 resting orders and 10_000 receipts, the
endpoints return within 50 milliseconds.

## Consequences

* The frontend can replace the paper-trading fixture data with
  the live ticker, depth, and trades without changing the data
  shape.
* The `/book` and `/sequence` endpoints remain internal; they are
  not part of the public surface. The operator's internal state
  is still accessible from the operator console but not from the
  public HTTP surface.
* The 24-hour window is computed from the receipt sequence
  number, not from a wall-clock timestamp, because the receipts
  do not carry a timestamp. A later PR will add wall-clock
  timestamps to the receipts and switch the windowed range to
  use real time.
* The endpoints are rate-limited at the HTTP layer, not in the
  pure functions. The pure functions are unbounded; the operator
  is responsible for setting the rate-limit headers.
* The pure functions are pure; the same operator state and the
  same `nowSeconds` always produce the same output. The functions
  never mutate the operator.

## Out of scope

* WebSocket and Server-Sent Events for live updates. The PR
  exposes only the snapshot endpoints; live streaming is a
  follow-up PR.
* Per-user order book subscriptions. The endpoints are public; a
  per-user feed is the responsibility of the wallet adapter and
  the auth surface, which are not in this PR.
* Aggregated candles (1m, 5m, 1h). The chart surface is a
  separate concern; the paper-trading fixtures already expose
  `chartSeries` for the no-value simulation.

## Related

* ADR 0004: atomic-swap state machine. The matcher's receipts
  carry the same transition discipline as the swap state.
* ADR 0006: atomic-swap observer. The observer and the matcher
  share a typed receipt and a typed fill; the market data
  derives its ticker from the receipt history.
