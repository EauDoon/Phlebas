# Rollback procedure

This document is the operator-facing procedure for rolling
back a production deploy. The procedure is the input to the
deploy runbook.

## When to roll back

Roll back the production deploy when one or more of the
following is true:

* the post-deploy checks fail;
* the SLO verdict is `not ready` after the deploy;
* the watchtower emits a new critical alert that is not
  attributable to a known issue;
* the operator's on-call rotation is changed unexpectedly.

## Steps

1. Stop the new version of the service with `SIGTERM`.
2. Start the previous version of the service.
3. Confirm the service's `/health` endpoint returns 200.
4. Confirm the service's `/metrics` endpoint returns a
   Prometheus text body with the expected counters.
5. Confirm the service's `/slo` endpoint returns a verdict
   with `meets: true`.
6. Open a rollback incident in the deploy channel.
7. Notify the security team that the rollback is in progress.

## Post-rollback

1. Confirm the SLO verdict for the service is "passing".
2. Confirm the watchtower's `/alerts` endpoint is not emitting
   any new critical alerts.
3. Write a post-mortem in the rollback incident channel.
4. Update the deploy checklist if the rollback procedure
   changed.
5. Schedule a working session to address the root cause.
