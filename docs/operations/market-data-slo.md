# Public market data SLO

This document is the SLO (service level objective) for the
public market data surface on the matcher service. The surface
is the read-only view of the matcher operator's in-memory state.
The SLO is the contract between the operator and the public
reader: the public reader trusts the surface to be live and
available, and the operator commits to the numbers below.

## Availability

The `/ticker`, `/trades`, `/depth`, and `/markets` endpoints are
available for 99.5 percent of the rolling 30-day window. The
window excludes scheduled maintenance that the operator announces
at least 24 hours in advance. The endpoints return 200 when the
matcher service's `/health` returns 200 and 503 when the matcher
service's `/health` returns 503.

## Latency

Each endpoint returns within 50 milliseconds at the 95th
percentile and within 200 milliseconds at the 99th percentile for
a matcher operator with fewer than 1_000 resting orders and
10_000 receipts. The endpoint latency is bounded by the
operator's in-memory state size; the network round-trip is
excluded from the budget.

## Freshness

The endpoint responses reflect the matcher operator's state at
request time. The matcher service is single-writer; the state
never lags behind the receipts by more than the persist-and-restore
cycle, which completes in under 10 milliseconds.

## Data integrity

The endpoints are pure functions over the matcher operator's
state. The endpoints never mutate the operator. The endpoints
never reach out to the network; every field is derived from the
in-memory state.

## Out of scope

The SLO does not cover:

* the matcher operator's `/orders` endpoint, which is operator-only;
* the matcher's `/book` and `/sequence` endpoints, which are
  internal and not part of the public surface;
* the chain-side latency, which is a property of the chain
  clients and not the public surface.
