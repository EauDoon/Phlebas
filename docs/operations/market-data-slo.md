# Public market data SLO changelog

This file tracks changes to the public market data SLO. Each
entry must include the date, the previous and new SLO values, and
the reason for the change.

## 01-09-2026 — initial SLO

- Availability: 99.5% rolling 30-day window.
- Latency: 50ms p95, 200ms p99, for an operator with fewer than
  1_000 resting orders and 10_000 receipts.
- Freshness: the endpoint responses reflect the matcher
  operator's state at request time.

The initial SLO is intentionally conservative. The matcher
operator's in-memory state is the only bottleneck; the network
round-trip is excluded from the budget. A future PR will tighten
the latency budget after a real Sepolia deployment is recorded.
