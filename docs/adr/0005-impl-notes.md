# ADR 0005 Implementation Notes

This file is a companion to [ADR 0005](0005-zcash-p2sh-atomic-swap.md).
ADR 0005 sets the design and the safety rules. This file captures the
operational notes that the implementation, the wallet adapter, and the
offchain coordinator need to agree on.

## Hash function boundary

The preimage primitive produces 32 random bytes. The same bytes feed two
hash functions:

- the EVM leg uses `keccak256(preimage)` and stores the 20-byte truncated
  form in the contract
- the ZEC leg uses `OP_HASH160` which is `RIPEMD160(SHA256(preimage))`

A witness that satisfies the EVM `claim` function is exactly the witness
the ZEC `claim` script checks. The two chains share a preimage, not a
digest.

## Lock time ordering

The matcher enforces that the ZEC refund deadline is strictly later than
the EVM refund deadline. The contract does not check this on chain; the
matcher rejects the fill before the deposit tx is signed. The wallet
adapter accepts the lock time as a parameter and does not validate it.

## Address encoding

The transparent address encoder uses the published testnet and mainnet
version bytes:

| Network | P2PKH | P2SH |
| --- | --- | --- |
| Testnet | `0x1D25` | `0x1CBA` |
| Mainnet | `0x1CB8` | `0x1CBD` |

The P2SH address of the atomic-swap script is `Base58Check(version, hash20)`,
where `hash20` is `RIPEMD160(SHA256(script))`. The Base58Check checksum
fails closed on a wrong-network or corrupt address.

## Wallet adapter seam

The wallet adapter returns an unsigned transaction. The signing surface
is an injected callback. The production code wires a real Zcash wallet
to the callback. The test code wires a deterministic in-memory signer
that returns a fixed 64-byte signature.

The signing surface is not active in this PR. The signing flag stays
off. The first signed ZEC transaction ships only with the wallet
adapter in a later PR.

## Out of scope

* Zcash transparent transaction encoding. The wallet adapter returns
  the structured fields; the byte-level encoding ships with the
  signing surface in a later PR.
* Zcash sighash computation. The signature hash depends on the
  transaction fields and the SIGHASH algorithm. The signing surface
  is the only place the sighash is computed.
* Shielded ZEC. The current lock surface uses the transparent pool.
* Cross-chain generalized message passing. The swap is a strict
  hash-and-deadline protocol.
