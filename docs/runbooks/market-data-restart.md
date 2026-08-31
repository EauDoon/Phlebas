# Public market data restart runbook

This runbook is the operator-facing procedure for restarting the
matcher service after an incident on the public market data
surface. The procedure is safe to run on a live matcher: the
matcher service's bootstrap path will refuse to start fresh if
the persisted state is missing after initialization.

## When to run

Run the runbook when one or more of the following is true:

* the `/ticker` endpoint returns 503;
* the `/depth` endpoint returns 503;
* the `/trades` endpoint returns 503;
* the `/markets` endpoint returns 503;
* the operator wants to roll the matcher binary;
* the on-disk matcher state was accidentally deleted.

## Pre-flight checks

1. Confirm the matcher persist path matches the
   `PHLEBAS_MATCHER_PERSIST_PATH` environment variable.
2. Confirm the marker file is present at `${path}.initialized`.
3. Confirm the operator has shell access on the matcher host.

## Procedure

### 1. Stop the matcher

Send `SIGTERM` to the matcher process. The process has 30
seconds to flush its in-memory state and exit. If the process
does not exit, send `SIGKILL` and proceed.

### 2. Verify the persisted state

```sh
ls -l "$PHLEBAS_MATCHER_PERSIST_PATH"
head -c 1024 "$PHLEBAS_MATCHER_PERSIST_PATH"
```

The file should be a JSON document with the operator's
configuration, order book, and receipt history.

### 3. Decide on the recovery path

* **Binary upgrade:** proceed to step 4.
* **State corruption:** back up the corrupted file
  (`mv .../state.json .../state.json.bak.$(date +%s)`) and
  proceed to step 4. The bootstrap will detect the missing state
  after the marker and refuse to start fresh; the operator must
  intervene by removing the marker file.
* **State deletion:** the bootstrap will detect the missing
  state after the marker and refuse to start fresh; the operator
  must intervene by removing the marker file.

### 4. Start the matcher

Start the matcher with the same environment variables as the
previous run. Confirm the `/health` endpoint returns 200 within
30 seconds.

### 5. Verify the public surface

```sh
curl -s http://127.0.0.1:8788/ticker | jq
curl -s http://127.0.0.1:8788/depth?levels=5 | jq
curl -s http://127.0.0.1:8788/markets | jq
```

The ticker, depth, and markets endpoints should return the
expected shape. A regression in any of these fields indicates a
recovery failure; revert the state and repeat from step 3.

## After the restart

* check the watchtower's `/alerts` endpoint (or the matcher
  service's own alert log) for any new alerts that arrived
  during the restart window;
* confirm the next poll advances the cursor by hitting
  `POST /orders` (operator-only) and reading the response.
