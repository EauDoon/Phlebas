# ADR 0007 implementation notes

This file records the implementation deviations, follow-ups, and
operational guidance for the public market data surface. The ADR
itself is in `0007-public-market-data.md`; this file is the change
log that operators and reviewers reach for when the live service
does not match the design.

## Implementation deviations

1. **Windowed range based on receipt sequence.** The 24-hour high,
   low, and volume are derived from the receipt sequence number,
   not from a wall-clock timestamp. The receipts do not yet carry
   a wall-clock timestamp; the production code will add a
   timestamp field to the receipt in a later PR and switch the
   windowed range to use real time. The current behavior is
   best-effort: the high/low/volume count fills whose receipt
   sequence is within the last 86_400 sequence numbers.

2. **No WebSocket or Server-Sent Events.** The PR exposes only
   snapshot endpoints. Live streaming is out of scope and will
   ship in a later PR once the watcher-style stream contract is
   designed.

3. **No rate limiting at the function layer.** The pure functions
   are unbounded. The HTTP layer applies a per-IP rate limit; the
   `src/lib/rate-limit.ts` module is the building block for that
   layer and is added in a follow-up commit.

4. **Public market data is read-only.** The endpoints do not
   mutate the matcher operator. The endpoints are safe to expose
   to the public; the internal `/book` and `/sequence` endpoints
   remain operator-only.

## Out of scope

* Wall-clock timestamps on receipts.
* WebSocket and SSE for live updates.
* Per-user order book subscriptions.
* Aggregated candles (1m, 5m, 1h). The chart surface is a
  separate concern; the paper-trading fixtures already expose
  `chartSeries` for the no-value simulation.

## Follow-up work

* add a `wallClockUnix` field to the `SequenceReceipt` type and
  switch the windowed range to use real time;
* add a WebSocket route that streams the live ticker, depth, and
  trades;
* wire the per-IP rate limiter into the matcher service.
