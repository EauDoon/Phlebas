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

1. Confirm the matcher data directory. It is
   `services/matcher/.data/native-v1/`, fixed in
   `services/matcher/server.ts`. There is no
   `PHLEBAS_MATCHER_PERSIST_PATH`; earlier revisions of this
   runbook named one, and no service has ever read it. Under
   Compose the directory is the `matcher-usdc-data` or
   `matcher-usdt-data` volume mounted at
   `/app/services/matcher/.data`.
2. Confirm the marker file `initialized` is present in that
   directory.
3. Confirm the operator has shell access on the matcher host.

## Procedure

### 1. Stop the matcher

Send `SIGTERM` to the matcher process. The process has 30
seconds to flush its in-memory state and exit. If the process
does not exit, send `SIGKILL` and proceed.

### 2. Verify the persisted state

```sh
ls -l services/matcher/.data/native-v1/
tail -c 1024 services/matcher/.data/native-v1/events.jsonl
cat services/matcher/.data/native-v1/checkpoint.json
```

The directory holds a hash-chained append-only journal, not a
single state document: `events.jsonl` carries one record per
line, `checkpoint.json` commits to a sequence and a replayed
state root, `initialized` is the canonical marker, and
`writer.lock` is present while a writer holds the directory.
`docs/OPERATOR_RUNBOOK.md` describes the same layout and is the
canonical account of it. A `writer.lock` on a stopped matcher
means another writer or an unproven stale lock: do not start a
second writer and do not delete the lock until the recovery
checks in that runbook pass.

### 3. Decide on the recovery path

* **Binary upgrade:** proceed to step 4.
* **State corruption:** back up the whole directory
  (`cp -a services/matcher/.data/native-v1
  services/matcher/.data/native-v1.bak.$(date +%s)`) rather than
  a single file, since the checkpoint and the journal only mean
  anything together, and proceed to step 4. The bootstrap will
  detect the missing state after the marker and refuse to start
  fresh; the operator must intervene by removing the marker
  file.
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
