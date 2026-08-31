# ADR 0008: Operations hardening surface

Date: 01-09-2026
Status: Accepted for key-independent development
Production status: Not approved

## Context

The Phlebas services are deployed as long-lived processes with
on-disk persistence. The operator needs a single operations
surface that covers: in-memory metrics, SLO tracking, alert
routing, and cross-service health aggregation. Without a unified
operations surface, the operator is forced to read each
service's `/health` endpoint independently and to interpret the
results manually.

The existing services expose `/health`, `/state`, and `/alerts`
endpoints. The endpoints are service-specific: the matcher's
`/health` returns a sequence and a sequence root; the
observer's `/health` returns a bootstrap state. The operator
needs a single surface that aggregates these into a single
verdict.

## Decision

The new operations surface is a set of four pure-function
libraries that the services consume and an HTTP layer that the
operator calls:

1. **`src/lib/metrics.ts`** — an in-memory metrics counter with
   Prometheus text rendering. The counter is a pure function
   over an in-memory state record. The counter never reaches
   out to the network.

2. **`src/lib/slo-tracker.ts`** — an SLO tracker that computes
   the rolling-window compliance for a service against a
   target SLO. The tracker returns a structured verdict
   (`ratio`, `threshold`, `meets`, `sampleCount`).

3. **`src/lib/health-aggregator.ts`** — a health aggregator that
   composes the health of every service into a single
   response. The aggregator is a pure function over a list of
   per-service health records.

4. **`src/lib/alert-router.ts`** — an alert router that decides
   which channel a watchtower alert goes to based on severity
   and service. The router is a pure function over a routing
   table.

Each service exposes a `/metrics` endpoint (Prometheus text) and
a `/slo` endpoint (SLO verdicts). The operator calls these
endpoints and aggregates the responses with the
`health-aggregator`.

The operations surface is read-only. The surface never reaches
out to the chain clients and never signs a transaction. The
surface is the operations team's single source of truth.

## Consequences

* The operator can replace manual `/health` polling with a
  single aggregated health check.
* The SLO verdicts are computed from in-memory samples; the
  samples are lost on restart. A later PR will add persistence
  for the SLO samples.
* The alert routing table is in-memory by default; the operator
  can load a custom table from the environment at deploy time.
* The metrics counter is in-memory by default; the metrics are
  lost on restart. A later PR will add a Prometheus remote-write
  adapter for durable metrics.

## Out of scope

* A Prometheus remote-write adapter.
* A SLO sample persistence layer.
* A cross-service tracing layer.
* A PagerDuty / Slack adapter. The alert router returns the
  routing decision; the operator is responsible for the actual
  delivery.

## Related

* ADR 0006: atomic-swap observer. The observer emits watchtower
  alerts; the alert router consumes them.
* ADR 0007: public market data. The public market data surface
  has its own SLO; the SLO tracker consumes its samples.
