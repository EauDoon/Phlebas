# Phlebas current progress

> Current summary as of 03-09-2026. This document supersedes the earlier cumulative branch diary. It intentionally does not pin a commit SHA, because a progress file that names its own pre-commit head becomes stale as soon as it is committed.

## Key-independent settlement boundary update — 03-09-2026

- Observer ingestion now has a canonical journal seam that replays accepted state and checks the exact expected journal head and state root before accepting funding or spend observations. It cannot authorize terms, confirm finality, sign, or broadcast. Durable coordinator hosting and independently verified chain sources remain open work.
- EVM claim review binds read-only code and state requests to one canonical finalized block hash; mixed-block evidence fails closed. The undeployed manifest still blocks production action review.
- Settlement preview distinguishes per-leg refund eligibility, observed refunds, and confirmed refunds, with synthetic timestamps and identities explicitly labeled. No wallet action is enabled.
- The release-readiness command uses the shared fail-closed evaluator and includes browser acceptance. Unknown gates, invalid runtime statuses, and deleted, duplicated, or downgraded canonical audit items cannot produce a ready result. A passing software verdict never substitutes for wallet, audit, legal, Testnet, or Mainnet approval.

## Local coordinator storage — not deployed

The canonical swap coordinator now has a local persistence library with explicit initialization, an exclusive writer lock, bounded canonical JSON, replay-verified snapshots, and durable replacement before acknowledgement. Exact expected journal heads and state roots serialize mutations; uncertain writes stop further mutations. Opening a missing store never creates a fresh history.

The library reuses the existing swap event/state schema and filesystem durability helper. It adds no service endpoint, RPC, wallet, signing, broadcast, or Vercel runtime. [Storage recovery](docs/runbooks/swap-coordinator-storage.md) describes stale-lock handling, uncertain commits, and the external checkpoint still required to detect a coherent rollback of every local file. Real-chain observer and operator qualification remain open.

The diagnostic EVM observer now requires exact ConditionalLock event topic counts, padded nonzero addresses, positive ABI amounts, and valid log identifiers before emitting a record. It exposes decoded fields through the existing diagnostic data record. This does not establish receipt success, contract identity, canonical inclusion, finality, or a claim preimage; canonical funding and spend facts still require independently verified chain sources.

The existing ConditionalLock ABI module also decodes exact constructor arguments, `LockCreated` topics/data, and claim calldata. Decoding rejects malformed widths, noncanonical address padding, out-of-range deadlines, and invalid bound terms. These pure codecs return structural data only: they do not verify a deployment, receipt, contract identity, preimage hash, canonical inclusion, or finality, and they do not produce authoritative funding or spend facts.

A pure EVM receipt adapter now binds caller-supplied successful deployment and funding receipt data to canonical terms for either exact Mainnet market. It checks every `LockCreated` term and the exact `Funded` event, rejects ambiguous or contradictory identities, and returns the existing immutable funding fact without an attestation or journal mutation. Receipt log processing is limited to 1,024 logs and 1 MiB of data per receipt; funding must be in a later block than deployment and within the committed funding deadline. This does not verify participant signatures, receipt provenance, runtime/source identity, canonical inclusion, or finality. Those checks and qualified observers remain required before any authoritative state transition or wallet action.

## Unsigned matcher terms — no submission enabled

An order-book fill can now be materialized into the existing canonical swap terms for either exact Mainnet market, with explicit settlement context and wallet-derived roles and Zcash script. Both order venue permissions are checked in the shared plan builder. Non-exact quote rounding and solver quote materialization fail closed; differing signed fee caps use their lower limit and the charged fee remains zero. Integration tests create policy-bound initial states with no authorizations and no funded leg. Wallet qualification, signature verification, matcher manifests, chain evidence, and release approvals remain required.

## Offline Zcash v5 signature digest — no wallet action

The transaction lab computes ZIP 244 transparent `SIGHASH_ALL` digests from verified committed v5 manifests using pinned personalized BLAKE2b-256. Independent Python vectors for fund, claim and refund match the pinned official Zcash reference implementation. The helper rejects v6, coinbase inputs and invalid indexes, and revalidates artifact integrity. It produces neither a signature nor transaction bytes or a transaction ID, and changes no wallet, chain, or release readiness. V6 requires separately verified current rules and vectors; transaction extraction, wallet qualification, and broadcast remain gated.

## Unsigned Zcash v5 wire encoding — no spending authorization

The lab serializes verified v5 artifacts into unsigned transparent transaction bytes with empty scriptSigs and no shielded payload. Independent wire vectors for fund, claim and refund match the pinned official ZIP 225 v5 serializer. Tests cover canonical input-count encoding across 252/253, exact byte order and scripts, fresh output buffers, and rejected v6, null coinbase outpoints and tampered artifacts. Sighash and wire tests share canonical fixture construction. No signature, signed-transaction extraction, transaction ID, complete signed size, relayability, wallet qualification, or release readiness follows from these bytes.

## ZEC address proof — local verification only

The existing candidate wallet adapter now rejects nonempty but invalid address-proof signatures. It verifies zcashd-format compact signatures against the exact requested Mainnet P2PKH account and challenge, with canonical Base64, bounded input, SHA-256 message hashing, public-key recovery and HASH160 comparison. The EVM `recoverAddress` path retains its low-s rule; Zcash compact recovery accepts zcashd's valid high-s signatures. A verified message does not qualify a wallet, prove fresh session ownership, authorize an order or fill, or enable extraction, broadcast or funds. No real wallet, key, node or network action was used.

## EVM terminal receipt binding — structural evidence only

The EVM adapter also binds caller-supplied claim and refund receipts to the exact prior funding fact for USDC or USDT. It checks terminal event identity, payout amount and role, funding provenance, known state timestamps, strict later-block ordering, deadline edges and claim preimage. It returns the existing immutable spend fact without an attestation or state mutation. Caller-supplied calldata is structurally checked but not proven to belong to the transaction; receipt provenance, runtime/source identity, canonical inclusion, finality and participant authorization remain external requirements. No network or value-moving path is enabled.

## EVM receipt acquisition — approved deployment required

The coordinator has an injected read-only EVM receipt acquisition path that cross-checks the approved deployment, funding transaction, receipts, containing blocks, logs and finalized runtime code before returning the existing receipt transport shapes. The production wrapper checks the repository deployment manifest before any provider request; the current undeployed record therefore blocks all RPC access through this entry point. Synthetic transport checks do not establish independent source quorum, cryptographic inclusion, observer attestations, reorg recovery or release approval, and no journal append, confirmation or wallet action is performed.

## Previous checkpoint (historical as of 01-09-2026)

- Active UI branch: `feat/prelaunch-copy-honesty`, cut from `main` after PR #34. Public chrome is a pre-launch venue (warm yellow accent, persistent preview chip, Open terminal). Landing, terminal, settlement fill ticket, and solver quotes. Vercel hosts UI only; no mainnet funds.
- Terminal and liquidity primary nav is Markets · Terminal · Liquidity · Docs · Status. SiteFooter carries “Phlebas is not a live exchange and not an offer of financial services.” 24h volume is off the market bar. The public UI may connect an EIP-6963 wallet on Ethereum Mainnet for read-only authority review; signing, approvals, submission, and value movement remain disabled. Historical AMM lives under Docs → Historical models only.
- Status/Legal/Security drop simulation/no-value labels. Market-state 24h notes drop fixture. Historical AMM volume row removed. Destination field is a check, not inspect.
- Playwright `test:browser` passed twice locally (301/301). `npm run check` passed.
- Merged: PR #34 chrome honesty; PR #33 Playwright follow-up; PR #32 pre-launch product site. Leave PR #26 alone.
- Prior integration: custodial gateway runtime removed from `main`.
- Product boundary: no-value production preview. The public application does not accept deposits, issue a receiver, mint or burn a redeemable asset, sign transactions, broadcast transactions, or move funds.
- Release boundary: production use with live funds remains blocked. Testnet and mainnet activation require separate evidence, review, and explicit authorization.
- The custody-capable TEX gateway and the legacy mint/reserve-attestation observer have been removed from the active runtime.
- Former gateway and legacy-observer ignored data remain untouched and outside source-control scope. The root Docker context categorically excludes every `**/.data` directory.
- The persistent matcher is the only service in the local Compose workflow. It holds no wallet key, constructs no transaction, and is not configured on Vercel.
- The native atomic-swap observer remains read-only reference code and is not part of Compose or the public production runtime.
- The AMM and LP surfaces remain historical in-browser simulations. They do not create deposits, withdrawals, or settlement authority.

## Superseded checkpoints and claims

The following statements from the old cumulative diary are historical and are not part of the current architecture:

- Old branch names and commit heads, including `feat/native-swap-state-machine` checkpoints.
- Gateway availability copy and caps such as `gatewayOffCopy` and `gatewayUnavailableCopy`.
- Gateway receiver, deposit, mint, burn, custody-signer, payout, or withdrawal mutation paths.
- The deleted legacy observer endpoints `/coverage`, `/attest`, and its confirmation-floor health surface.
- Claims that gateway or legacy-observer mutations are persisted.

Historical deposit and withdrawal tours remain explicitly labeled demonstrations. Their controls do not call a custody service or expose a payable receiver.

## Runtime and authority map

| Surface | Current role | Authority |
| --- | --- | --- |
| Next.js application | Landing, trading simulation, status, documentation, historical tours | No keys, no signing, no broadcast, no live-funds action |
| Persistent matcher | Loopback order sequencing and replayable receipts | Can sequence or halt orders, cannot settle or move value |
| Native swap libraries | Signed terms, evidence validation, deterministic state and recovery model | Reference implementation, no RPC or broadcast |
| Atomic-swap observer service | Read-only reference adapter | Not deployed, not in Compose, no custody or settlement authority |
| AMM and LP libraries | Historical deterministic simulation | No live liquidity or token contract |

The canonical native settlement authority is the signed swap terms plus verified chain evidence reduced through the journal-backed state machine. UI state, matcher receipts, and observer assertions cannot independently authorize a claim, refund, transfer, mint, or withdrawal.

## Current verification commands

Run from the repository root:

```powershell
npm run lint
npm run typecheck
npm test
npm run scan:secrets
npm run build
npm run test:browser
```

The secret scanner reads tracked bytes from `git ls-files`; it does not enumerate or read ignored service data. Docker containment is checked by `services/infra.test.ts`, which binds the matcher image to its exact transitive source-import closure and requires custody-data, secret, VCS, and build-output exclusions.

## Open release gates

- Keep Vercel free of `PHLEBAS_MATCHER_URL` and every local service.
- Complete current wallet compatibility evidence for exact native fund, claim, and refund transactions.
- Complete reviewed chain adapters, finality and reorganization policy, independent security review, legal review, operator recovery drills, monitoring, and reproducible deployment manifests.
- Obtain separate authorization before any Testnet value movement, contract deployment, funded address, RPC credential, push, PR merge, Vercel deployment, or mainnet activation.

Until those gates close, all public copy and actions must remain truthful about the no-value preview boundary.
