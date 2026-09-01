# ADR 0006 implementation notes

Status: Historical no-value diagnostic. Not settlement authority.

The current `services/atomic-swap-observer` implementation predates the canonical signed `SwapState` and journal boundary. It is retained for deterministic diagnostics and cannot authorize matcher settlement or wallet actions.

## Known deviations

- The EVM decoder matches the undeployed exact-token ABI, but it does not bind a deployed chain, address, receipt, finality policy, or canonical journal head.
- Zcash spend classification validates the exact input, redeem script, branch shape, key hash, preimage or CLTV shape, but it does not verify the signature against the full transaction digest, destination outputs, confirmations, or canonical chain.
- Raw observations update a mutable projection rather than the canonical hash-chained journal.
- Default refund offsets are diagnostic fixture values, not approved chain policy.

## Required containment

- Keep the service loopback-only and outside Vercel.
- Mark responses as diagnostic and untrusted.
- Do not import its projection from canonical swap, matcher settlement, wallet, signing, or broadcast modules.
- Hold no key, sign nothing, and broadcast nothing.

## Replacement work

Before any Testnet wallet action, complete the strict EVM and Zcash source adapters, bind exact signed terms and cross-chain commitments, apply versioned confirmation and deadline policy, and append facts through the canonical journal at the exact expected head. Reorganization, persistence, and disagreement tests must pass before the adapter can become authoritative.
