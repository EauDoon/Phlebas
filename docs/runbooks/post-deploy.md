# Post-deploy runbook

This runbook is the operator-facing procedure for verifying a
deploy after the service has been restarted. The runbook is
the companion to the pre-deploy runbook.

## When to use

Use this runbook immediately after the pre-deploy runbook has
completed. The post-deploy runbook verifies that the new
version of the service is healthy and that the SLO verdicts
remain "passing".

## Steps

1. Confirm the service's `/health` endpoint returns 200.
2. Confirm the service's `/metrics` endpoint returns a
   Prometheus text body with the expected counters.
3. Confirm the service's `/slo` endpoint returns a verdict
   with `meets: true`.
4. Confirm the watchtower's `/alerts` endpoint is not emitting
   any new critical alerts.
5. Confirm the operator's on-call rotation is unchanged.
6. Close the deploy channel in the team chat.

## Rollback

If any of the post-deploy checks fail, follow the pre-deploy
runbook's rollback procedure.
