# Session roundtrip runbook

This runbook is the operator- and reviewer-facing procedure for the session export and import roundtrip. The session export and import are pure functions over a JSON string. The roundtrip is what makes a session snapshot portable across two reviewers, a bug report, and a fresh test run.

## What the roundtrip covers

* The export builds a deterministic, versioned JSON snapshot of the in-browser session state. The schema tag is `phlebas-session-snapshot` and the schema version is `1`.
* The import parses the snapshot, validates the schema tag, the schema version, the market, and the field shape, and returns either the parsed snapshot or a structured rejection.
* The import never reaches out to the network. The import never signs a transaction. The import never accepts a snapshot from a market other than `ZEC/USDC` or `ZEC/USDT`.

## When to use the roundtrip

* A reviewer wants to compare the state of two sessions to confirm a bug fix.
* A user wants to share a session with another user without giving up the wallet or the matcher credentials.
* A test suite wants to seed a deterministic starting state from a recorded snapshot.

## How to use the roundtrip

1. The first user opens the trading terminal, runs a session, and clicks `Copy session JSON` in the session blotter. The browser clipboard now contains a JSON payload.
2. The first user pastes the payload into a bug report, a discussion thread, or a code review.
3. The second user opens the same session in a fresh browser, opens the developer console, and pastes the payload. The console reads it back through `parseSessionSnapshot` and verifies the schema tag and version.
4. The reviewer compares the parsed snapshot to the second user's session state. A roundtrip through `JSON.parse` then `JSON.stringify` must produce a byte-identical payload when the second string is sorted by the serializer's canonical key order.

## Failure modes

| Symptom | Cause | Action |
| --- | --- | --- |
| Parser returns `invalid-json` | the payload was truncated or copied with extra characters | re-copy the payload without trailing whitespace or trailing comma |
| Parser returns `schema-mismatch` with `unexpected schema tag` | the payload is from a different schema family | re-export from the current build |
| Parser returns `schema-mismatch` with `unsupported schema version` | the payload is from a future build | upgrade the consumer to the matching version |
| Parser returns `shape-invalid` with `missing field` | the payload is missing a top-level field | re-export from the current build |
| Parser returns `shape-invalid` with `unsupported market` | the payload is for a market the current build does not support | re-export from the current build |

## Cross-references

- `src/lib/session-export.ts` — the snapshot builder and serializer.
- `src/lib/session-import.ts` — the parser, validator, and apply function.
- `src/lib/session-import.test.ts` — unit tests for the parser and validator.
- `docs/runbooks/session-export.md` — the export side of the roundtrip.
- `PROGRESS.md` — batch summary.
