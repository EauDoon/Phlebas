# ADR 0005: Zcash P2SH Atomic Swap Leg

Date: 01-09-2026
Status: Accepted for key-independent development
Production status: Not approved

## Context

ADR 0002 defines the production target: one two-chain atomic swap per matched fill, with a transparent Zcash P2SH leg and an EVM conditional-lock leg sharing one hash, one preimage, and staggered refund deadlines. ADR 0003 fixes the EVM half. ADR 0004 fixes the offchain state machine and the read-only `/swap` view. The ZEC half is the only remaining leg without a documented surface.

The current repository has the Zcash transparent address inspection (`inspectTransparentDestination`), the in-browser matcher, the keccak and SHA-256 primitives, the secp256k1 recovery primitive, the ZIP 321 placeholder, the local TEX gateway, and the EVM conditional lock. It does not have a Zcash address encoder, a P2SH script builder, a transparent transaction template, or a wallet adapter.

The ZEC leg of an atomic swap is implemented as a transparent P2SH output that holds ZEC until either the buyer reveals the preimage on the Zcash claim path or the seller refunds after the lock time. The same preimage and the same hash are bound on both legs. The P2SH script is the only part of the ZEC leg that can be implemented, tested, and adversarially reviewed without a Zcash spend key.

## Decision

Add the encoding surface for the ZEC half of the atomic swap. The wallet adapter remains a typed interface; the signing surface stays gated.

### Address encoding

Zcash transparent addresses are Base58Check encodings of a 2-byte version and a 20-byte payload. The payload for P2PKH is `RIPEMD160(SHA256(compressed_pubkey))`. The payload for P2SH is `RIPEMD160(SHA256(redeem_script))`. The checksum is the first 4 bytes of `SHA256(SHA256(version || payload))`.

The version bytes are:

| Network | P2PKH | P2SH |
| --- | --- | --- |
| Mainnet | `0x1CB8` | `0x1CBD` |
| Testnet | `0x1D25` | `0x1CBA` |

The project targets testnet. The encoder accepts a `network` parameter and defaults to testnet. The encoder refuses the mainnet version on a public deployment, the same way the existing `inspectTransparentDestination` works for both.

### P2SH script

The atomic-swap P2SH script encodes the claim and refund branches of one fill. The shared hash binds the buyer and the seller to the same preimage. The lock time is the chain-local refund deadline. The two signers are bound to the two branches.

```text
IF
    HASH160 <expected_hash20> EQUALVERIFY
    <buyer_pubkey> CHECKSIG
ELSE
    <locktime> CHECKLOCKTIMEVERIFY DROP
    <seller_pubkey> CHECKSIG
ENDIF
```

`<expected_hash20>` is the 20-byte hash of the preimage. Per the Zcash script engine, the hash check is `OP_HASH160 <expected> OP_EQUALVERIFY`, which compares the 20-byte `RIPEMD160(SHA256(preimage))` to the expected value. The same hash function is what the EVM leg uses, so a single preimage validates on both chains.

`<locktime>` is a 4-byte little-endian unix timestamp. The `OP_CHECKLOCKTIMEVERIFY` opcode rejects any spend where the spending transaction's nLockTime is below this value.

The two pubkeys are the compressed secp256k1 pubkeys of the buyer and the seller. The script is encoded as a serialized byte string in the standard Zcash P2SH redeem-script format.

The script address is `Base58Check(version=0x1CBA, payload=RIPEMD160(SHA256(script)))`. The matcher and the buyer and the seller each reconstruct the same script and the same address from the same fill terms; a divergence in any byte is a stop condition.

### Hash function

The preimage is 32 random bytes. The 20-byte `expected_hash20` is `RIPEMD160(SHA256(preimage))`. The EVM leg uses `SHA256(preimage)` directly; the ZEC leg uses the 20-byte truncated form because the Zcash script engine operates on `OP_HASH160` which is the same 20-byte hash.

The same preimage is valid on both chains. A witness that passes the EVM `claim` function is exactly the witness that the Zcash `claim` script checks via `OP_HASH160` after the preimage is pushed.

### Wallet adapter

The wallet adapter is a typed interface that the matcher and the UI call without holding a Zcash spend key. The interface has three methods:

* `buildFund(script, amount, params): UnsignedTransaction` — produces a transparent transaction that funds the P2SH output.
* `buildClaim(utxo, preimage, params): UnsignedTransaction` — produces a transparent transaction that spends the P2SH output via the claim branch.
* `buildRefund(utxo, params): UnsignedTransaction` — produces a transparent transaction that spends the P2SH output via the refund branch after the lock time.

The interface returns an `UnsignedTransaction` and a transaction id. The signing surface is not part of this PR. The wallet adapter accepts a `signer` callback that the production code injects; the test code uses a deterministic in-memory signer. The interface never holds a key and never reads a key from disk.

### Signing boundary

The address encoding, the script builder, the hash function, and the wallet adapter interface are key-independent. The signing surface is not part of this PR. The signing flag stays off. The first ZEC transaction in this PR is the deterministic test vector; the first ZEC transaction on a live chain ships only when the operator sets the explicit env flag and the user explicitly authorizes the transaction in their wallet.

## Why this design

The P2SH script is the smallest script that satisfies the deterministic safety rules in ADR 0002. One script encodes both terminal outcomes. The hash function is `OP_HASH160`, which is what every Zcash P2SH script uses for hash locks. The lock time is `OP_CHECKLOCKTIMEVERIFY`, which is the standard opcode and the only opcode that the project relies on for the refund deadline.

The wallet adapter is a typed interface that the matcher and the UI can call without holding a spend key. The interface is the only place where the signing surface could be added in a later PR. The signing surface is not added now because ADR 0002 forbids it.

The address encoding is the encoding the rest of the system already uses. The version bytes, the Base58Check checksum, the RIPEMD160 + SHA256 hash chain, and the compressed secp256k1 pubkey format are all standard.

## Alternatives considered

### Open claim with a single signer

A single-signer P2SH script that allows the buyer to claim or the seller to refund is the bare minimum. It is rejected because it allows the buyer to claim without revealing the preimage on the ZEC chain, which would leave the seller's EVM leg unrefundable until the EVM deadline.

### Two outputs instead of one P2SH

Two separate outputs, one for the buyer's claim path and one for the seller's refund path, are not how Zcash atomic swaps are designed. A single P2SH output keeps the value atomic, prevents the buyer and the seller from double-spending the same value, and matches ZIP 300.

### Shielded ZEC

A shielded atomic swap would use Sapling or Orchard. It is rejected for v1 because the current lock surface uses the transparent pool. The shielded path is the subject of a future ADR.

### Bech32m for transparent addresses

Zcash transparent addresses use Base58Check. Unified addresses use Bech32m, but they encode shielded receivers. The transparent address format is fixed by consensus and is the only path the script engine can recognize.

## Consequences

The ZEC half of the atomic swap now has a documented surface. The matcher, the UI, the wallet adapter, and the future signing surface all bind to the same address and the same script.

The ZEC transaction construction, the sighash, the witness assembly, and the live wallet binding remain in a later PR. This PR is the encoding half of the lab; the next PR is the transaction half.

The preimage primitive in `src/lib/preimage.ts` already produces 32 random bytes. The same preimage validates on both chains. The wallet adapter accepts the preimage as a parameter and never sees it on the offchain coordinator.

## Required guardrails

* The address encoder refuses the mainnet version on a public deployment.
* The script builder rejects a buyer pubkey and a seller pubkey that are equal.
* The script builder rejects a lock time that is not strictly later than the EVM refund deadline.
* The hash function is `OP_HASH160`, which is `RIPEMD160(SHA256(x))`. No other hash function is used on the ZEC leg.
* The wallet adapter returns an `UnsignedTransaction`. The signing surface is an injected callback. The interface never reads a key from disk and never holds a key in memory.
* The signing flag stays off. No live ZEC transaction is broadcast in this PR.

## Mainnet gate

This ADR advances to a production decision only after:

* the transparent transaction template ships and the sighash is verified against a current Zcash testnet;
* the wallet adapter ships with a signing surface that the user explicitly authorizes;
* the ZEC lock time construction is reviewed and tested against a current wallet;
* an independent review of the script and the address encoding;
* executed wallet tests for funding, claim, and refund paths;
* a current-source verification of the address version bytes and the script opcodes;
* legal and compliance approval for the named operator and jurisdictions;
* explicit approval for any testnet or mainnet action.

Until then, the encoder and the script builder are key-independent primitives in a local test environment.

## Revisit conditions

Revisit this decision if any of the following occurs:

* ZIP 300 changes the script opcode set or the hash function;
* Zcash transparent addresses switch to a different encoding;
* the wallet adapter surface needs a shielded branch;
* the lock time construction moves away from `OP_CHECKLOCKTIMEVERIFY`;
* the operator or jurisdiction requires a different signing surface.
