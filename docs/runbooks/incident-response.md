# Incident response runbook

This runbook is the operator-facing procedure for responding to
incidents on any Phlebas service. The runbook applies to the
matcher, the atomic-swap observer reference service, and the watchtower. The
runbook is intentionally short; the per-service runbooks in
`docs/runbooks/` cover the service-specific restart procedures.

## When to use

Use this runbook when one or more of the following is true:

* the SLO verdict for any service is "failing";
* the watchtower emits a critical alert;
* the matcher service's `POST /v1/orders` endpoint is returning 503;
* the observer service's `/health` endpoint is returning 503;

## Pre-flight

1. Confirm the on-call rotation. The on-call engineer is the
   incident commander.
2. Open a private incident channel in the team chat.
3. Confirm the latest deploy and the latest commit on `main`.
4. Pull the SLO verdicts for the last 30 days from the SLO
   tracker; record the verdicts in the incident channel.

## Containment

The first priority is to stop the bleeding. The containment
depends on the failing service.

There is no environment switch that halts order acceptance while
leaving the service running, and none should be assumed:
containment is stopping the process. Earlier revisions of this
runbook named `PHLEBAS_MATCHER_ACCEPT` and
`PHLEBAS_OBSERVER_PAUSE`. Neither has ever been read by any
service, so an operator following those steps would have
believed a market was halted while it went on accepting orders.

* **matcher service**: stop it with
  `docker compose -f services/compose.yaml stop matcher-usdc`
  (or `matcher-usdt`), or interrupt the Node process for a
  direct run. The journal is append-only and each record is
  fsynced before the response, so a stop loses no accepted
  order. Nothing settles while the matcher is down: it sequences
  orders and cannot move value, so a halt costs liveness only.
  `acceptingMutations` in the `/health` body is derived from the
  configuration and store state. It reports whether the matcher
  is accepting. It is not a control.
* **observer diagnostic**: stop the process. The observer is not
  in the Compose file and is not part of the production runtime,
  so there is nothing to stop unless an operator started it by
  hand. Treat the on-disk snapshot as untrusted diagnostic
  state, not settlement authority. No wallet or matcher action
  may depend on it.

Neither service holds a key, so no containment step here can
strand, redirect, or release funds, and the wallet-controlled
refund path on each chain is unaffected by all of it.

## Diagnosis

The diagnosis depends on the failing service. Only the first and
last steps apply to both services; the rest are observer routes
and the matcher does not serve them.

1. Read the service's `/health` endpoint. Both serve it. The
   response body surfaces the bootstrap state and the persist
   readability.
2. Matcher only: read `/v1/checkpoint` and `/v1/sequence` for
   the journal position, and `/slo` and `/metrics` for the rest.
   The matcher has no `/state` route.
3. Observer only: read `/state` for the cursor, the fill count
   and the alert count, and `/alerts` for the watchtower's own
   view of the failure mode. Both are labelled
   `diagnostic-untrusted` and neither is settlement authority.
4. Read the operator's on-disk logs. The logs are the canonical
   record of the failure.

## Recovery

The recovery procedure is the per-service runbook. The
operator must:

1. Follow the per-service runbook to restart the service.
2. Verify the service's `/health` endpoint returns 200 within
   30 seconds.
3. Verify the watchtower's `/alerts` endpoint no longer emits
   the alert.
4. Verify the SLO verdict returns to "passing".

## After the incident

1. Write a post-mortem in the incident channel. The post-mortem
   must include the timeline, the root cause, the customer
   impact, and the follow-up actions.
2. Update the per-service runbook if the recovery procedure
   changed.
3. Add a regression test if the bug is reproducible.
4. Add an alert if the bug would have been caught earlier by a
   more specific alert.
5. Update the SLO threshold if the target is too tight or too
   loose.
