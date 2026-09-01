# Incident response runbook

This runbook is the operator-facing procedure for responding to
incidents on any Phlebas service. The runbook applies to the
matcher, the observer, the gateway, and the watchtower. The
runbook is intentionally short; the per-service runbooks in
`docs/runbooks/` cover the service-specific restart procedures.

## When to use

Use this runbook when one or more of the following is true:

* the SLO verdict for any service is "failing";
* the watchtower emits a critical alert;
* the matcher service's `/orders` endpoint is returning 503;
* the observer service's `/health` endpoint is returning 503;
* the gateway service is unable to attest a mint outpoint.

## Pre-flight

1. Confirm the on-call rotation. The on-call engineer is the
   incident commander.
2. Open a private incident channel in the team chat.
3. Confirm the latest deploy and the latest commit on `main`.
4. Pull the SLO verdicts for the last 30 days from the SLO
   tracker; record the verdicts in the incident channel.

## Containment

The first priority is to stop the bleeding. The containment
depends on the failing service:

* **matcher service**: if `/orders` is failing, stop accepting
  new orders by setting `PHLEBAS_MATCHER_ACCEPT=0` on the
  matcher host. Existing orders continue to settle. The
  matcher's `/health` should still return 200.
* **observer diagnostic**: if `/health` is failing, stop its
  polling loop by setting `PHLEBAS_OBSERVER_PAUSE=1`. Treat the
  on-disk snapshot as untrusted diagnostic state, not settlement
  authority. No wallet or matcher action may depend on it.
* **gateway service**: if the gateway is failing, the mint
  attestation surface is down. The mint surface is no-value for
  the native-ZEC direction; the operator should halt the
  gateway's `/attest` endpoint and notify the on-call.

## Diagnosis

The diagnosis depends on the failing service. The diagnostic
checklist applies to every service:

1. Read the service's `/health` endpoint. The response body
   surfaces the bootstrap state and the persist readability.
2. Read the service's `/state` endpoint. The response surfaces
   the cursor, the fill count, and the alert count.
3. Read the watchtower's `/alerts` endpoint. The alerts explain
   the failure mode.
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
