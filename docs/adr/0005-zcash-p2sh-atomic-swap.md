# ADR 0005: Zcash P2SH Atomic Swap Leg

Date: 01-09-2026
Status: Superseded by the Zcash transaction lab
Production status: Not approved

This ADR is retained as historical design context only. Its HASH160 digest is not the same value as the EVM SHA-256 digest, and its transaction-shaped wallet-adapter examples are incomplete synthetic values. Do not use them for construction, signing, or wallet integration. The canonical current boundary is [ZCASH_TRANSACTION_LAB.md](../ZCASH_TRANSACTION_LAB.md).

## Context

ADR 0002 defines the production target: one two-chain atomic swap per matched fill, with a transparent Zcash P2SH leg and an EVM conditional-lock leg sharing one hash, one preimage, and staggered refund deadlines. ADR 0003 fixes the EVM half. ADR 0004 fixes the offchain state machine and the read-only `/swap` view. The ZEC half is the only remaining leg without a documented surface.

The current repository has the Zcash transparent address inspection (`inspectTransparentDestination`), the in-browser matcher, the keccak and SHA-256 primitives, the secp256k1 recovery primitive, a non-payable ZIP 321 placeholder, and the EVM conditional lock. It does not have a Zcash address encoder, a P2SH script builder, a transparent transaction template, a wallet adapter, or a TEX receiver generator.

The historical proposal used a transparent P2SH output that held ZEC until either the buyer revealed a preimage on the Zcash claim path or the seller refunded after the lock time. Its HASH160 digest did not equal the EVM SHA-256 digest.

## Decision

The historical decision added only address, script, and synthetic display helpers. The current transaction-lab boundary supersedes them.

### Address encoding

Zcash transparent addresses are Base58Check encodings of a 2-byte version and a 20-byte payload. The payload for P2PKH is `RIPEMD160(SHA256(compressed_pubkey))`. The payload for P2SH is `RIPEMD160(SHA256(redeem_script))`. The checksum is the first 4 bytes of `SHA256(SHA256(version || payload))`.

The version bytes are:

| Network | P2PKH | P2SH |
| --- | --- | --- |
| Mainnet | `0x1CB8` | `0x1CBD` |
| Testnet | `0x1D25` | `0x1CBA` |

The historical encoder supports both testnet and mainnet primitives. The active legacy `/zcash` display is restricted to testnet and no longer displays a funding address.

### P2SH script

The historical P2SH script encoded claim and refund branches around a 20-byte HASH160 digest. It did not establish equality with a 32-byte SHA-256 digest on another chain.

```text
IF
    HASH160 <expected_hash20> EQUALVERIFY
    <buyer_pubkey> CHECKSIG
ELSE
    <locktime> CHECKLOCKTIMEVERIFY DROP
    <seller_pubkey> CHECKSIG
ENDIF
```

`<expected_hash20>` is the 20-byte HASH160 result for the preimage. It is distinct from the EVM leg's 32-byte SHA-256 digest.

`<locktime>` is a 4-byte little-endian unix timestamp. The `OP_CHECKLOCKTIMEVERIFY` opcode rejects any spend where the spending transaction's nLockTime is below this value.

The two pubkeys are the compressed secp256k1 pubkeys of the buyer and the seller. The script is encoded as a serialized byte string in the standard Zcash P2SH redeem-script format.

The script address is `Base58Check(version=0x1CBA, payload=RIPEMD160(SHA256(script)))`. The matcher and the buyer and the seller each reconstruct the same script and the same address from the same fill terms; a divergence in any byte is a stop condition.

### Hash function

The preimage is 32 random bytes. The 20-byte `expected_hash20` is `RIPEMD160(SHA256(preimage))`. The EVM leg uses `SHA256(preimage)` directly; the ZEC leg uses the 20-byte truncated form because the Zcash script engine operates on `OP_HASH160` which is the same 20-byte hash.

The same preimage can be hashed by both functions, but the 20-byte HASH160 result is not the same digest as the 32-byte SHA-256 result. This mismatch is one reason this design is superseded.

### Legacy synthetic display shapes

The historical fund, claim, and refund values are incomplete display shapes. They omit canonical Zcash serialization and consensus fields, do not resolve a transaction ID, and are not wallet inputs. No signer callback or signing boundary exists in this module.

### Signing boundary

The historical address and script helpers are key-independent. The synthetic display shapes do not authorize or enable signing. No ZEC transaction is constructed, signed, extracted, or broadcast by this ADR.

## Why this design

The historical script used `OP_HASH160`; the canonical transaction lab instead uses `OP_SHA256`. The historical builder does not enforce the cross-chain refund-margin policy and must not be used for funding.

The legacy display helper is not a wallet adapter. Any future signing boundary requires a separate design and approval.

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

The historical ZEC encoding surface remains documented, but it is superseded and must not be treated as transaction or wallet evidence.

The superseding transaction lab commits unsigned effecting data, but complete serialization, sighash construction, witness assembly, and live wallet binding remain unavailable.

The legacy display helper accepts preimage bytes only to render an incomplete shape. It provides no cross-chain digest equivalence or signing assurance.

## Required guardrails

* The active legacy display is testnet-only and displays no funding address.
* The script builder rejects a buyer pubkey and a seller pubkey that are equal.
* The historical builder does not establish deadline-margin or cross-chain digest equivalence and must not be used for funding.
* The canonical transaction lab uses `OP_SHA256`; the historical display uses `OP_HASH160` only for legacy vectors.
* The legacy display module returns only explicitly labeled incomplete synthetic shapes. It has no signer surface and no transaction ID.
* The signing flag stays off. No live ZEC transaction is broadcast in this PR.

## Mainnet gate

This ADR advances to a production decision only after:

* the transparent transaction template ships and the sighash is verified against a current Zcash testnet;
* a separately designed and approved wallet integration proves full transaction compatibility;
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
