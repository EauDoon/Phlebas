# Native swap coordinator storage

This is a key-independent local storage library. It is not a deployed coordinator, a chain observer, a signature verifier, or a wallet service. No HTTP route, RPC connection, signing, or broadcast is added. Vercel must never host this directory or its data.

## Authority and data

Use the existing canonical `SwapState`, `SwapEventPayload`, journal receipts, and snapshot roots. The caller supplies a trusted pristine initial state; persisted JSON cannot replace its terms or policies. The storage codec only converts the existing bigint fields to canonical decimal strings. Journal validation and semantic replay remain authoritative for internal state consistency. The caller must verify participant signatures and chain-source/finality evidence before appending the corresponding events; a hash-consistent history does not prove those external facts.

Each swap has a dedicated directory containing `store.json` and an exclusive `writer.lock`. The directory itself records initialization: creation is explicit, existing directories cannot be initialized again, and opening a missing or incomplete store fails. Keep these files on an isolated operator volume, excluded from Git, Docker build contexts, application bundles, and Vercel. They may contain settlement identities and observed preimages; they are not public market-data responses.

A successful append requires the current journal head and state root. It serializes mutations, writes the next canonical document durably before publishing state, and accepts a duplicate only against the current head. An uncertain write or changed lock ownership stops subsequent mutations. Read access returns immutable copies of the last acknowledged in-memory state; it does not prove which bytes survived an uncertain commit.

## Restart and recovery

1. Stop the affected process and keep that swap unavailable to mutation.
2. Preserve the directory and the caller's last acknowledged journal head, state root, and snapshot outside the affected volume. Never edit event contents to make replay pass.
3. Establish that no process owns the writer lock. A lock is not stale merely because its process appears slow or an RPC is unavailable. The library does not steal or automatically delete stale locks.
4. After explicit operator recovery of a proven stale lock, open the existing store with the original trusted initial state. Missing files, noncanonical JSON, wrong identity, unsupported fields, invalid events, exceeded bounds, and snapshot disagreement fail closed.
5. Compare replayed state with the independently retained checkpoint. After an uncertain write, either the prior or new complete document may have survived. Reconcile the exact event and roots before deciding whether to retry; do not infer success from the attempted write.
6. Verify current chain evidence and wallet authority separately before recommending any action. Opening a valid store never authorizes funding, claiming, or refunding.

Local hashes cannot detect a coherent rollback or replacement of every local file. Production needs an independently retained checkpoint, protected backups, tested recovery, and chain reconciliation. Directory ownership and filesystem isolation remain operator responsibilities; the lock is for cooperative single-writer exclusion, not protection against an administrator rewriting the volume.

## Verification and limits

The focused tests exercise explicit creation, bounded reopen and replay, duplicate and stale requests, lock ownership, immutable results, and injected atomic-write failures. They contain no live chain transactions. File and event caps limit accepted histories; the current reference implementation replays history and rewrites the complete bounded document. Qualify capacity and crash recovery on the target filesystem before hosting it.

Current wallet, contract, observer, legal, Testnet, and Mainnet release gates remain unchanged. This library alone does not close the authoritative-observer qualification requirement.
