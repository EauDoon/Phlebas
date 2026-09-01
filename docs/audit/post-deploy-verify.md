# Post-deploy verification

This document is the operator-facing procedure for verifying
a production deploy after the service has been restarted. The
procedure is the input to the post-deploy runbook.

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

## Failure modes

| Symptom | Cause | Action |
| --- | --- | --- |
| `/health` returns 503 | bootstrap is `missing` or `error` | check the persist path; check the marker file |
| `/metrics` is empty | metrics counter is broken | check the metrics counter code |
| `/slo` returns `meets: false` | SLO threshold is too tight | check the SLO target; check the sample buffer |
| `/alerts` emits a new critical alert | watchtower detected a stop condition | follow the per-service runbook |

## Rollback

If any of the post-deploy checks fail, follow the rollback
procedure in the deploy checklist.
