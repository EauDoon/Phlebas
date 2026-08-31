# Atomic-swap observer SLO

This document is the SLO (service level objective) for the
atomic-swap observer. The observer is the read-only surface that
watches the ConditionalLock contract and the P2SH lock addresses,
applies transitions to a persistent coordinator, and surfaces the
watchtower's alerts. The SLO is the contract between the operator
and the user: the user trusts the observer to keep the
coordinator in sync with the chains, and the operator commits to
the numbers below.

## Availability

The observer HTTP service is available for 99.5 percent of the
rolling 30-day window. The window excludes scheduled maintenance
that the operator announces at least 24 hours in advance. The
`/health` endpoint returns 200 when the bootstrap is `ready` and
503 when the bootstrap is `missing` or `error`.

## Latency

The `/observe` endpoint (one-shot poll) returns within 2 seconds at
the 95th percentile and within 5 seconds at the 99th percentile
for a coordinator with fewer than 1_000 fills. The poll duration
includes the round-trip to the EVM and ZEC clients and the
disk-write of the snapshot.

## Data freshness

The coordinator's snapshot is at most 1 poll-interval behind the
chains. The poll interval is configured by
`PHLEBAS_OBSERVER_POLL_INTERVAL_SECONDS` and defaults to 15 seconds.
A poll that observes no new events advances the cursor and
overwrites the snapshot; a poll that observes new events applies
each event as a transition and writes the new snapshot before
returning.

## Alerting

The watchtower emits an alert when:

* the EVM leg is funded past the EVM refund deadline
  (`deadline-breach`);
* both legs are funded but no terminal event has arrived past the
  configured buffer (`missing-terminal-event`);
* a claim or refund was observed within the configured reorg depth
  (`reorg-depth-exceeded`).

Each alert is a structured record with `fillId`, `alert`, `message`,
`recommendedAction`, and `at`. The `recommendedAction` field is a
short human-readable string; the operator maps the string to a
paging surface in the runbook.

## Data integrity

The snapshot is written atomically: the layer writes the new
content to a temporary file in the same directory, fsyncs the
file, and renames it on top of the target. The bootstrap writes a
marker file on first success and refuses to start fresh if the
snapshot is missing after the marker is present.

## Out of scope

The SLO does not cover the matcher, the wallet adapter, or the
frontend. The SLO does not cover the chains themselves. A
chain-side incident (Arbitrum reorg, Zebrad outage) is reflected
in the SLO only through the watchtower's alert volume.
