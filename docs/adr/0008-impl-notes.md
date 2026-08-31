# ADR 0008 implementation notes

This file records the implementation deviations, follow-ups, and
operational guidance for the operations hardening surface. The
ADR itself is in `0008-operations-hardening.md`; this file is the
change log that operators and reviewers reach for when the live
service does not match the design.

## Implementation deviations

1. **In-memory metrics and SLO samples.** The metrics counter
   and the SLO tracker are in-memory only. The samples are lost
   on restart. A later PR will add a persistence layer for the
   SLO samples and a Prometheus remote-write adapter for the
   metrics counter. The current implementation is sufficient
   for the testnet; a production deployment will need the
   persistence layer.

2. **No Prometheus remote-write adapter.** The metrics counter
   renders the Prometheus text format on demand. The operator is
   responsible for scraping the `/metrics` endpoint and
   forwarding the samples to a durable store. A later PR will
   add a remote-write adapter.

3. **No SLO sample persistence.** The SLO tracker caps the
   per-key buffer at 10_000 samples by default. The samples are
   lost on restart. A later PR will add a JSON-on-disk
   persistence layer for the SLO samples.

4. **Default alert routing table is in code.** The default
   routing table is defined in `src/lib/alert-router.ts`. The
   operator can override the table by loading a custom table
   from the environment at deploy time. The override mechanism
   is not implemented in this PR.

5. **Health aggregator is a pure function.** The aggregator is
   not wired into a single HTTP endpoint; the operator calls
   the per-service `/health` endpoint and aggregates the
   responses manually. A later PR will add a unified health
   endpoint that calls the per-service endpoints and returns
   the aggregated verdict.

## Out of scope

* A Prometheus remote-write adapter.
* A SLO sample persistence layer.
* A cross-service tracing layer.
* A PagerDuty / Slack adapter. The alert router returns the
  routing decision; the operator is responsible for the actual
  delivery.

## Follow-up work

* add a remote-write adapter for the metrics counter;
* add a JSON-on-disk persistence layer for the SLO samples;
* wire a custom alert routing table from the environment;
* add a unified health endpoint that calls the per-service
  endpoints and returns the aggregated verdict.
