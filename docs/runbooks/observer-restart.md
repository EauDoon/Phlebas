# Atomic-swap observer restart runbook

This runbook covers only the legacy no-value diagnostic observer in a
local or isolated test environment. It is not a production settlement
runbook, its snapshots are not canonical swap state, and none of its
responses authorize claim, refund, release, or wallet action. Do not use
this procedure on a value-bearing coordinator.

## When to run

Run the runbook when one or more of the following is true:

* the `/health` endpoint returns 503 with `bootstrap: missing`;
* the operator wants to roll the observer binary;
* the on-disk snapshot was accidentally deleted;
* the operator wants to recover from a corrupted snapshot.

## Pre-flight checks

1. Confirm the snapshot path matches the
   `PHLEBAS_OBSERVER_SNAPSHOT_PATH` environment variable.
2. Confirm the marker file is present at `${path}.initialized`.
3. Confirm the operator has shell access on the observer host.

## Procedure

### 1. Stop the observer

Send `SIGTERM` to the observer process. The process has 30 seconds
to flush its in-memory state and exit. If the process does not
exit, send `SIGKILL` and proceed.

### 2. Verify the snapshot

```sh
ls -l "$PHLEBAS_OBSERVER_SNAPSHOT_PATH"
head -c 1024 "$PHLEBAS_OBSERVER_SNAPSHOT_PATH"
```

The file should be a JSON document with the `version`, `cursor`,
`fills`, and `alertLog` fields. If the file is missing, the
bootstrap will refuse to start fresh.

### 3. Decide on the recovery path

* **Binary upgrade:** proceed to step 4.
* **Snapshot corruption:** back up the corrupted file
  (`mv .../coordinator.json .../coordinator.json.bak.$(date +%s)`)
  and proceed to step 4. The bootstrap will detect the missing
  snapshot after the marker and refuse to start fresh; the operator
  must intervene by removing the marker file
  (`rm .../coordinator.json.initialized`).
* **Snapshot deletion:** the bootstrap will detect the missing
  snapshot after the marker and refuse to start fresh; the
  operator must intervene by removing the marker file.

### 4. Start the observer

Start the observer with the same environment variables as the
previous run. Confirm the `/health` endpoint returns 200 with
`bootstrap: ready` within 30 seconds.

### 5. Verify the diagnostic projection

```sh
curl -s http://127.0.0.1:8790/state | jq
```

The `fillCount` should match the count from the previous diagnostic run.
The `cursor` should resume from the previous value. A regression in
either field indicates a diagnostic recovery failure. It does not prove
chain settlement state or authorize a value-bearing transition.

## After the restart

* check the watchtower's `/alerts` endpoint for any new alerts that
  arrived during the restart window;
* confirm the next poll advances the cursor by hitting
  `POST /observe` and reading the response.
