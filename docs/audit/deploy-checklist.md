# Deploy checklist

This document is the operator-facing checklist for the
production deploy. The checklist is the input to the
production deploy runbook.

## Pre-deploy

* [ ] the release verdict is `ready`
* [ ] the audit checklist has 0 open items
* [ ] the on-call engineer has signed off on the release verdict
* [ ] the production deploy key is loaded into the CI secret store
* [ ] the production RPC URLs are loaded into the CI secret store
* [ ] the production wallet adapter is configured
* [ ] the PagerDuty / Slack integration is wired
* [ ] the Prometheus remote-write adapter is configured

## Deploy

* [ ] the deploy host is reachable
* [ ] the deploy host has the required disk space
* [ ] the deploy host has the required CPU and memory
* [ ] the deploy host is on the latest LTS
* [ ] the deploy host has the required system packages

## Post-deploy

* [ ] the service's `/health` endpoint returns 200
* [ ] the service's `/metrics` endpoint returns a Prometheus text body
* [ ] the service's `/slo` endpoint returns a verdict with `meets: true`
* [ ] the watchtower's `/alerts` endpoint is not emitting any new critical alerts
* [ ] the operator's on-call rotation is unchanged
* [ ] the deploy channel is closed in the team chat

## Rollback

* [ ] the on-call engineer has confirmed the rollback
* [ ] the previous version of the service is restarted
* [ ] the service's `/health` endpoint returns 200
* [ ] the SLO verdict for the service is "passing"
* [ ] the rollback incident is opened in the deploy channel
