# ADR 0006: Atomic swap observer diagnostic

Date: 01-09-2026

Status: Accepted only as a local no-value diagnostic

Production status: Superseded for settlement authority

## Context

ADR 0002 defines the native ZEC atomic-swap target. ADR 0004 and the hash-chained swap journal define the canonical signed-terms and evidence state. The older Fill observer, coordinator snapshot, and watchtower were built before that authority boundary was complete.

The older service reduces raw EVM and Zcash observations into a mutable Fill projection. It is useful for deterministic diagnostics, but it does not bind complete signed terms, enforce evidence quorum, prove canonical-chain finality, or replay the canonical journal. Its EVM decoder now matches the undeployed exact-token lock ABI, and its Zcash decoder no longer infers claim or refund from height alone. Those improvements do not make the projection authoritative.

## Decision

Retain the older observer stack only as an isolated, key-independent, no-value diagnostic:

- `src/lib/swap-fill-projection.ts` is an untrusted projection.
- `src/lib/atomic-coordinator.ts` and `src/lib/coordinator-snapshot.ts` may store diagnostic state only.
- `services/atomic-swap-observer/` remains loopback-only and may not authorize a wallet action.
- `/swap` may display the projection only when it is labeled as a legacy diagnostic and exposes no fund, claim, refund, sign, or broadcast control.
- No matcher, wallet adapter, canonical swap module, or execution route may import the diagnostic projection.

The only canonical native-settlement authority is the signed `SwapState` transition model plus its validated hash-chained journal and evidence policy. Observer facts must enter that authority through a future strict adapter that verifies exact terms, identities, commitments, confirmation policy, and journal-head continuity.

## Diagnostic service behavior

The diagnostic service may:

- Poll configured read-only JSON-RPC endpoints.
- Reduce deterministic mock observations.
- Persist a local projection snapshot.
- Expose loopback health and diagnostic Fill responses.
- Emit alerts without taking action.

It must:

- Hold no private key or spend authority.
- Sign and broadcast nothing.
- Identify every response as diagnostic and untrusted.
- Fail closed on malformed configuration, persistence, or observations.
- Remain outside the Vercel frontend deployment.

## Production HOLD

The diagnostic service cannot advance to settlement authority until all of the following exist and pass independent review:

- A strict EVM source adapter that binds the exact deployed chain, contract, ABI, receipt, finality, `swapId`, and `termsHash` to one canonical journal fact.
- Complete Zcash funding and spend evidence, including the exact transaction digest and valid signature, outputs, script, outpoint, preimage or refund branch, confirmations, and canonical-chain checks.
- A matcher-to-signed-terms adapter with one shared cross-chain commitment and exact integer accounting.
- Multiple approved observations or an explicit evidence-quorum policy.
- A journal-backed fact adapter that accepts only valid transitions at the exact canonical journal head.
- Reorganization, rollback, restart, corruption, deadline, and observer-disagreement drills.
- Wallet compatibility evidence, contract review, legal approval, and explicit Testnet authorization.

Mainnet additionally requires successful Testnet operation, independent audits, reproducible services, verified deployment identities and bytecode, production monitoring and incident drills, and separate authorization for real assets.

## Consequences

The existing observer code remains testable and useful for diagnostics, but it is not a source of settlement truth and is not production-complete. Any documentation or runbook that calls its snapshot authoritative is superseded by this ADR.

This boundary allows key-independent development to continue without implying that a raw event stream can move value.
