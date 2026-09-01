# Zcash Transparent Transaction Lab

Status: key-independent candidate implementation

Updated: 01-09-2026

## Boundary

The lab builds deterministic plans for transparent Zcash P2SH funding, claim, and refund transactions. It does not serialize a consensus transaction, produce a transaction ID, connect to a wallet or node, sign, extract, broadcast, or claim relayability.

Each committed artifact identifies itself as `candidate-unsigned-effecting-data-manifest`. Its SHA-256 manifest digest binds the ordered inputs, outputs, values, scripts, fee, profile, target height, expiry height, locktime, sequence, and authorization plan. The digest is an artifact commitment. It is not a Zcash transaction ID.

No API in this lab accepts a seed, spending key, private key, signature, wallet database, funded address fixture, or private endpoint. Claim artifacts contain the preimage by design, so they remain sensitive before the claim is public.

## Current source findings

The implementation separates current published behavior from candidate Phlebas interfaces.

| Subject | Published behavior used by the lab | Phlebas boundary |
| --- | --- | --- |
| Transparent P2SH and CLTV | The Zcash protocol applies BIP 16 and BIP 65 from genesis. | The exact redeem script is parsed and validated before an artifact is built. |
| Atomic-swap template | ZIP 300 is Proposed and transparent-only. It gives a public-key-hash claim and refund construction. | The template is a candidate. No wallet compatibility or adoption claim follows from the ZIP. |
| PCZT | ZIP 374 Draft Revision 0 defines PCZT roles and versions. PCZT version 2 supports transaction versions 5 and 6. | The adapter is a candidate review boundary. Header checks alone do not verify a full PCZT. |
| Zallet | Current Zallet documentation separates PCZT creation, inspection, signing, combining, proving, and extraction. Its documented `pczt_create` shape lets the wallet select inputs and change. | Current documentation does not prove arbitrary P2SH inputs, exact outputs, locktime, expiry, and change control for this swap. Compatibility stays unproven. |
| Payment requests | ZIP 321 encodes payment-request metadata. | A ZIP 321 URI cannot commit funding outpoints, scripts, locktime, expiry, change, or transaction identity. |
| Fees | ZIP 317 Revision 0 is Active. Revision 1 is Draft for NU6.3. Their transparent-only logical-action calculation is the same. | The caller supplies a bounded fee policy and finalized byte counts. Relay acceptance remains unresolved without node policy. |
| Expiry | ZIP 203 makes expiry height `N` eligible through block `N` and expired after it. | An expired artifact must be rebuilt. Signed fields must never be changed in place. |

## Redeem script

The builder emits this exact public-key-hash template:

```text
OP_IF
  OP_SIZE <32> OP_EQUALVERIFY
  OP_SHA256 <digest32> OP_EQUALVERIFY
  OP_DUP OP_HASH160 <claimPkh20>
OP_ELSE
  <absoluteLock> OP_CHECKLOCKTIMEVERIFY OP_DROP
  OP_DUP OP_HASH160 <refundPkh20>
OP_ENDIF
OP_EQUALVERIFY
OP_CHECKSIG
```

The digest must be 32 bytes. Each recipient public-key hash must be 20 bytes. The lock uses minimal signed-magnitude little-endian script-number encoding.

A height lock ranges from `1` to `499999999`. A timestamp lock ranges from `500000000` to `4294967295`. The claim witness plan contains signature, public key, exact 32-byte preimage, and a true branch selector. The refund plan contains signature, public key, and a false branch selector. These are placeholders. The lab never holds those signatures or public-key bytes.

The frozen zero-preimage vector is:

```text
sha256(preimage): 66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925
redeemScript:      6382012088a82066687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f29258876a91400112233445566778899aabbccddeeff00112233670380841eb17576a914ffeeddccbbaa99887766554433221100fedcba986888ac
HASH160(script):   983b2e116805e826f812241e9160b2bf43ff519b
testnet P2SH:      t2LRjac7XRYh3aMbixigsm2QqM2zYsMp1KW
```

The vector script is 96 bytes and has one static sigop. The builder rejects a redeem script over the 520-byte P2SH push limit. Current Zcash policy source accepts standard P2SH outputs and limits redeem-script sigops, but policy is not a consensus guarantee or proof that a specific wallet will relay the transaction.

## Transaction policy

The lab pins a named NU6.3 encoding fixture:

| Field | Value |
| --- | --- |
| Mainnet activation height | `3428143` |
| Testnet activation height | `4134000` |
| NU6.3 branch ID | `37a5165b` |
| Version 5 group ID | `26a7270a` |
| Version 6 group ID | `d884b698` |

These values identify an offline construction profile. They do not assert a live chain tip or current UTXO state. A future consensus epoch requires a new profile and new vectors.

Manifest identifiers use normal eight-digit hexadecimal display order. A later consensus serializer must encode the applicable 32-bit transaction fields in their protocol byte order. Display transaction IDs are reversed exactly once when serialized as transparent prevouts.

Funding and claim inputs use sequence `0xffffffff`. Refund inputs use `0xfffffffe`, which enables absolute locktime without asserting relative lock or replacement semantics. The refund transaction locktime equals the redeem-script operand. Conservative refund construction requires a supplied height or time cutoff strictly later than that operand.

No BIP 68 relative-lock rule or BIP 125 replacement rule is assumed. Missing height, time, UTXO, confirmation, or mempool policy returns an unresolved assessment or blocks artifact construction.

## Funding plan

The funding builder requires ordered, public UTXO data with exact outpoints, values, transparent P2PKH addresses, and matching scriptPubKeys. It derives the contract P2SH output from the validated redeem script.

Output order is fixed:

1. Contract output.
2. Optional P2PKH change output.

The caller supplies the requested fee, a maximum fee, a minimum output, a maximum transaction size, and finalized byte counts. Change below the configured minimum must be rejected or explicitly added to the fee. Silent omission is forbidden.

## Claim and refund plans

Both spend builders bind one exact contract outpoint, its value, the P2SH scriptPubKey, and the redeem script. The outer script hash must match the redeem script.

The claim path requires an exact 32-byte preimage whose SHA-256 digest matches the script. Its output must be a network-correct P2PKH address whose hash matches the claim branch.

The refund path requires a network-correct P2PKH address whose hash matches the refund branch. Missing, equal, or early height or time evidence blocks construction. The spend value must equal the recipient output plus fee. Spend change is not supported by this artifact version.

## PCZT and wallet review

The candidate adapter binds the committed manifest to opaque PCZT bytes and wallet inspection fields. It fixes `SIGHASH_ALL` and `tx_modifiable = 0`. Transaction version 6 requires PCZT version 2.

Readiness requires proven support for:

* caller-supplied transparent inputs;
* custom P2SH and redeem-script data;
* exact ordered outputs;
* exact fallback locktime;
* exact expiry height.

An adapter marked unproven or unsupported for any required capability must reject readiness. `pczt_inspect` output is review data, not independent verification. A complete adapter must parse all applicable ZIP 374 fields, verify effecting data, confirm UTXOs from an approved source, and recompute the extracted transaction ID.

PCZT files may contain viewing data, note material, derivation paths, and other sensitive fields. Treat opaque PCZT bytes as sensitive even when no spending key is present.

## Restart, expiry, and substitution

Persist the canonical artifact, exact PCZT bytes, their SHA-256 digests, and the lifecycle state atomically. Rehydration fails if the JSON is noncanonical, a digest changes, an unknown field appears, or an unsupported state is supplied.

A timeout during wallet work has unknown status. Reload the last committed bytes and repeat exact inspection. Never infer that signing or extraction completed.

An expired artifact, changed outpoint, changed value, changed script, changed output, changed fee, changed lock, or changed expiry requires fresh construction and review. Merging conflicts must fail. Last-write-wins behavior is forbidden.

## Tests

The focused tests cover:

* Base58Check prefixes, wrong network, checksum, script shape, and transaction ID byte order;
* exact redeem-script, HASH160, P2SH, script-number, and sigop vectors;
* malformed and nonminimal scripts;
* wrong digest, preimage, recipient, contract hash, sequence, and consensus profile;
* fee, size, value conservation, explicit change, and below-minimum change;
* early refund, absent maturity evidence, expiry boundaries, and unresolved replacement policy;
* canonical serialization, restart, duplicate outpoints, and artifact substitution;
* PCZT header, capability, inspection, and lifecycle boundaries.

Run the lab checks with:

```bash
node --test src/lib/zcash-*.test.ts
npm run typecheck
npm run lint
```

`npm run check` remains the repository release gate. Browser tests are required when UI bytes change. This workstream changes no UI bytes.

## Prohibited actions

This lab does not authorize RPC connection, wallet connection, signing, extraction, broadcast, deployment, mainnet use, testnet use, or funded fixtures. Those actions require a separate exact approval, current wallet and node evidence, and the applicable release gates.
