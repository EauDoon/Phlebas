# Session export runbook

This runbook is the operator- and reviewer-facing procedure for the session export feature. The session export is a deterministic JSON snapshot of the in-browser session state for a given market.

## What the snapshot contains

* `schema: "phlebas-session-snapshot"` and `schemaVersion: 1` — version tags so the consumer can reject older or newer payloads.
* `exportedAt` — ISO 8601 timestamp of when the snapshot was built.
* `market`, `settlementPair` — the market identity the snapshot was built for.
* `account` — the paper-account state for that market: ZEC atoms, reserved ZEC atoms, quote atoms.
* `book` — the order book for that market: bids, asks, sequence, last ticks.
* `fills` — the in-memory user fills for the session.
* `sessionLog` — the deterministic session log: submit, cancel, reset events.

The snapshot is a pure function over a state record. The snapshot never includes a wallet address, a private key, a spending key, a viewing key, a transaction, or any network resource. The snapshot never reaches out to the network.

## How to use it

In the trading terminal, the session blotter has a `Copy session JSON` button. Clicking the button writes the snapshot to the clipboard and updates the button label to `Copied session JSON`. The clipboard write uses the browser `navigator.clipboard.writeText` API.

The user can paste the snapshot into a bug report, a discussion thread, or a code review. The reviewer can paste the snapshot into a JSON parser and inspect the state. A second reviewer with the same seed can reproduce the same session by re-running the matcher with the same inputs.

## When the clipboard is unavailable

If the browser blocks the clipboard (for example, a non-secure context, a missing user gesture, or a permission policy), the button label becomes `Copy failed` instead of `Copied session JSON`. The fallback path is asserted by a Playwright test that overrides `navigator.clipboard` to `undefined` and verifies the failure label appears.

## Failure modes

| Symptom | Cause | Action |
| --- | --- | --- |
| Button label stays as `Copy session JSON` after click | the browser did not fire the click handler | check the browser console for errors; the handler is a no-op if the ref is detached |
| Button label becomes `Copy failed` | the clipboard API is unavailable or blocked | paste the snapshot manually from the page state, or use a browser that supports the clipboard API on a secure context |
| Pasted JSON has no `phlebas-session-snapshot` schema tag | the consumer copied a different JSON payload | ask the user to re-click the button on the session blotter and re-paste |
| Pasted JSON is empty | the session had no orders, fills, or log events | empty sessions are still valid; the snapshot is just minimal |

## Cross-references

- `src/lib/session-export.ts` — the snapshot builder, serializer, and description.
- `src/lib/session-export.test.ts` — unit tests.
- `src/components/order-blotter.tsx` — the `Copy session JSON` button.
- `docs/audit/a11y-changelog.md` — accessibility changelog (the button is reachable from the existing skip-nav).
- `PROGRESS.md` — batch summary.
