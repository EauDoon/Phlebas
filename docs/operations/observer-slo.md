# Diagnostic observer objectives

This document records non-production objectives for the legacy no-value
observer. Its projections are diagnostic and untrusted. They are not
canonical swap state, do not establish chain settlement facts, and do
not authorize claim, refund, release, or wallet action. The targets below
apply only to a local or isolated test deployment and create no user-facing
availability commitment.

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

The diagnostic snapshot aims to be at most 1 poll interval behind its
configured fixtures or test clients. The poll interval is configured by
`PHLEBAS_OBSERVER_POLL_INTERVAL_SECONDS` and defaults to 15 seconds.
A poll that observes no new events advances the cursor and
overwrites the snapshot; a poll that observes new events applies
each event as a transition and writes the new snapshot before
returning.

## Alerting

The watchtower emits an alert when:

* the diagnostic projection labels an EVM leg funded past the EVM refund deadline
  (`deadline-breach`);
* both legs are funded but no terminal event has arrived past the
  configured buffer (`missing-terminal-event`);
* a claim or refund was observed within the configured reorg depth
  (`reorg-depth-exceeded`).

Each alert is a structured diagnostic record with `fillId`, `alert`,
`message`, `recommendedAction`, and `at`. A `recommendedAction` is an
operator investigation hint only. It must never be passed to a wallet or
canonical settlement state machine as authority.

## Data integrity

The snapshot is written atomically: the layer writes the new
content to a temporary file in the same directory, fsyncs the
file, and renames it on top of the target. The bootstrap writes a
marker file on first success and refuses to start fresh if the
snapshot is missing after the marker is present.

## Out of scope

These objectives do not cover the matcher, wallet adapter, frontend,
chains, production settlement, or any value-bearing service. A chain-side
incident is reflected only as untrusted diagnostic output.
