# Pre-deploy runbook

This runbook is the operator-facing procedure for deploying a
new version of any Phlebas service. The runbook is intentionally
short; the per-service runbooks in `docs/runbooks/` cover the
service-specific rollback procedures.

## When to use

Use this runbook when one or more of the following is true:

* a new commit has been merged to `main` for the matcher, the
  observer, the gateway, or the watchtower;
* a new SLO has been added or updated;
* a new alert routing rule has been added or updated.

## Pre-flight

1. Confirm the latest commit on `main` matches the planned
   deploy.
2. Confirm the SLO verdicts for the last 30 days are "passing"
   for the service being deployed.
3. Confirm the watchtower's `/alerts` endpoint is not emitting
   any critical alerts.
4. Confirm the on-call rotation. The on-call engineer is the
   deploy commander.
5. Open a deploy channel in the team chat.

## Deploy

1. Pull the latest commit on `main` to the deploy host.
2. Run the QA gate: `npm run check`. The QA gate must pass.
3. Run `npm run build`. The build must succeed.
4. Stop the service with `SIGTERM`. The service has 30 seconds
   to flush its in-memory state and exit.
5. Start the new version of the service.
6. Confirm the service's `/health` endpoint returns 200 within
   30 seconds.
7. Confirm the SLO verdict for the service remains "passing".
8. Confirm the watchtower's `/alerts` endpoint is not emitting
   any new critical alerts.

## Rollback

If any of the post-deploy checks fail, roll back to the
previous version. The rollback procedure is:

1. Stop the new version of the service with `SIGTERM`.
2. Start the previous version of the service.
3. Confirm the service's `/health` endpoint returns 200.
4. Confirm the SLO verdict for the service is "passing".
5. Open a rollback incident in the deploy channel.

## After the deploy

1. Close the deploy channel in the team chat.
2. Update the per-service runbook if the deploy procedure
   changed.
3. Update the SLO changelog if the SLO threshold changed.
