# ADR 0004: Atomic Swap State Machine and UI

Date: 01-09-2026
Status: Accepted for key-independent development
Production status: Not approved

Current Zcash boundary: references below to a signing-capable Zcash wallet adapter or a next-PR signing surface are historical and superseded by `docs/ZCASH_TRANSACTION_LAB.md`. The present candidate PCZT integration is header-only. Its API exposes no dedicated seed, spending-key, private-key, viewing-key, or signature-byte parameters, but opaque PCZT content remains potentially sensitive. Wallet readiness stays blocked while full serialization and relayability remain unresolved.

## Context

ADR 0002 defines the production target: one two-chain atomic swap per matched fill, with a transparent Zcash P2SH leg and an EVM conditional-lock leg sharing one hash, one preimage, and staggered refund deadlines. ADR 0003 fixes the EVM half of that workflow as the `ConditionalLock` contract.

The current repository has the EVM contract, the in-browser matcher, the order lifecycle, the EIP-712 order intent, the keccak primitives, the observer and gateway services, and the simulation UI. It does not have a state machine that tracks a single fill across both chains. It does not have a UI that shows the user the current state of a fill and the next action that is safe. It does not have a preimage primitive that the browser can generate, display, and verify.

The state machine and the UI can be built without any wallet or deployment key. The user or solver still signs every funding, claim, and refund transaction. The state machine and the UI only encode the rules, the available actions, and the next safe step. The signing surface remains gated by `NEXT_PUBLIC_PHLEBAS_SEPOLIA_SUBMIT=1` and by the Zcash wallet adapter that the next batch ships.

## Decision

Add a deterministic state machine for a single fill, a preimage primitive, and a public swap view that surfaces the current state and the next safe action.

### State shape

A fill has one `evmLeg` and one `zecLeg`. Each leg is tracked independently. The combined fill state is derived from the two leg states plus a coordinator-level flag. The combined state is what the UI displays.

```text
proposed                  neither leg is funded
awaiting-zec-fund         EVM leg funded, ZEC leg pending
awaiting-zec-claim        both legs funded, neither claimed
awaiting-evm-claim        ZEC leg claimed, EVM leg pending
settled                   both legs claimed
evm-refundable           EVM refund deadline passed, leg not refunded
zec-refundable           ZEC refund deadline passed, leg not refunded
evm-refunded              EVM leg refunded
zec-refunded              ZEC leg refunded
fully-refunded            both legs refunded
disputed                  observer disagreement, wrong evidence, or timeout with no path
```

The leg state is one of:

```text
pending | funded | claimed | refunded
```

The combined state is a pure function of the two leg states, the two refund deadlines, and a single coordinator-level `disputed` flag. There is no time, no random, and no I/O in the state machine. The matcher and the observer push transitions; the UI does not transition state on its own.

### Transition rules

The state machine accepts the following transitions and rejects every other change.

| From | Event | To |
| --- | --- | --- |
| any non-terminal | `mark-disputed` | `disputed` |
| `proposed` | `evm-leg-funded` | `awaiting-zec-fund` |
| `awaiting-zec-fund` | `zec-leg-funded` | `awaiting-zec-claim` |
| `awaiting-zec-claim` | `zec-leg-claimed` | `awaiting-evm-claim` |
| `awaiting-evm-claim` | `evm-leg-claimed` | `settled` |
| any with EVM leg funded and not refunded and not past refund deadline | (no transition) | (unchanged) |
| `proposed`, `awaiting-zec-fund` | `evm-refund-deadline-passed` | `evm-refundable` |
| `proposed`, `awaiting-zec-fund`, `awaiting-zec-claim` | `zec-refund-deadline-passed` and ZEC leg not yet funded | `zec-refundable` |
| `awaiting-zec-claim`, `awaiting-evm-claim`, `evm-refundable` | `zec-refund-deadline-passed` and ZEC leg funded and not claimed | `zec-refundable` |
| `evm-refundable` | `evm-leg-refunded` | `evm-refunded` |
| `zec-refundable` | `zec-leg-refunded` | `zec-refunded` |
| `evm-refunded` and `zec-refunded` | (combined) | `fully-refunded` |

`mark-disputed` is the only transition that can fire from any state. It is also the only transition the watcher can fire. Every other transition has one specific event from a specific source.

### Preimage primitive

The preimage is 32 random bytes. The hash is `SHA-256(preimage)`. The preimage is what the ZEC leg's claim script checks. The same preimage is what the EVM leg's `claim` function takes as the second argument.

The browser generates the preimage with `crypto.getRandomValues`, displays it once to the user, and stores it locally. The user is responsible for the preimage until the ZEC claim reveals it on chain. The matcher and the coordinator never see the preimage before the ZEC claim. The preimage is never sent to any backend service.

The EVM hash and the ZEC script are derived from the same preimage, so the preimage and hash pair is the only thing the user must keep consistent between the two chains.

### Swap view

A new public route `/swap?fill=<id>` shows the current state, the next safe action, the chain and asset identities, the deadlines, the hash, and the preimage once it is generated. The view is read-only. It never requests a wallet connection, never requests a signature, and never broadcasts a transaction. Every action button is a no-value simulation control until the signing surface ships in a later PR.

The view uses the same simulation copy, the same 44px targets, the same reduced-motion rules, and the same keyboard navigation as the rest of the application. It is not an exception to the production design system.

### Signing boundary

The state machine, the preimage primitive, and the swap view are key-independent. The signing surface is not part of this PR. The next PR adds the Zcash P2SH script builder and the wallet adapter. The signing surface only enables once the operator sets the explicit env flag, and only when the user explicitly authorizes a transaction.

## Why this design

The fill workflow crosses two chains and two protocol boundaries. A pure function of the leg states and the deadlines is the only representation that stays deterministic. Anything that depends on wall-clock time, on a random value, or on a backend service introduces an oracle or a race. The state machine here is reproducible and replayable: two observers reading the same evidence produce the same state.

The preimage primitive is the only key-independent primitive that has to live in the browser. Generating it in the browser keeps the matcher and the coordinator out of the preimage path. The preimage is what the user is holding, not what the platform sees.

The swap view is read-only and never signs. It is the surface the user uses to confirm the current state and the next action. Adding signing to the view would convert the application from a read-only state surface to a custody surface, which is exactly what ADR 0002 forbids.

## Alternatives considered

### Time-driven state machine

A time-driven machine that ticks every block would be smaller but introduces a global clock and a global notifier. It is rejected because the same evidence must produce the same state on every observer. The current design is event-driven: the matcher or the observer pushes a transition, and the state machine validates it.

### Combined state without per-leg state

A combined state without per-leg state would lose the ability to express "EVM funded, ZEC pending" cleanly. The UI would have to fabricate phrases to describe the same fact. Per-leg state is the smallest model that supports every label the user sees.

### Preimage generated by the matcher

A matcher-generated preimage would give the matcher advance knowledge of the ZEC claim. That converts the matcher from a sequencer into a custodian. The preimage must originate in the buyer's wallet. The browser generation is the only safe path.

### Signing built into this PR

Signing built into this PR would let the application move funds, which is the exact thing ADR 0002 forbids. The signing surface ships only with the wallet adapter in a later PR, and only after the legal, audit, and authorization gates pass.

## Consequences

The fill workflow now has a single source of truth that the matcher, the coordinator, the observer, and the UI can all read.

The preimage primitive is in the browser. The user must protect it. The state machine never stores it.

The `/swap` route is the only place the user sees the current state of a fill. The existing `/trade` and `/liquidity` routes do not change.

The matcher and the observer can replay every transition. Two observers reading the same evidence produce the same state. A divergence between two observers moves the fill to `disputed` exactly once.

## Required guardrails

* The state machine is a pure function. No time, no random, no I/O.
* The preimage is generated in the browser. It never leaves the browser until the user's wallet signs a ZEC claim.
* The hash is `SHA-256(preimage)`. The same hash is used on the EVM leg and the ZEC leg.
* The `disputed` state is terminal until an explicit `resolve-disputed` event is added in a later PR. A disputed fill never resumes normal flow.
* The signing surface is not part of this PR. The signing flag stays off.
* The swap view is read-only. It never requests a wallet connection, a seed phrase, a private key, or a signature.

## Mainnet gate

This ADR advances to a production decision only after:

* the Zcash P2SH builder and its tests are complete;
* the wallet adapter for the chosen ZEC and EVM wallets ships;
* the signing flag and the explicit user authorization are wired and tested;
* an independent review of the state machine and the preimage primitive;
* an adversarial review of the transition rules against every replay scenario;
* executed wallet tests for funding, claim, and refund paths;
* legal and compliance approval for the named operator and jurisdictions;
* explicit approval for any testnet or mainnet action.

Until then, the state machine is a key-independent primitive and the `/swap` view is a no-value simulation.

## Revisit conditions

Revisit this decision if any of the following occurs:

* the ZEC P2SH path changes in a way that requires a non-SHA-256 hash;
* a partial fill or a multi-leg swap becomes a requirement;
* the matcher, coordinator, or observer needs a new transition that the current rules do not express;
* the legal or compliance posture requires the platform to know the preimage.
