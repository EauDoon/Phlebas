# ConditionalLock source and bytecode verification

This procedure identifies one exact `ConditionalLock` build and, after a separately authorized deployment, proves that its constructor packet and onchain runtime match that build. It does not authorize a wallet, RPC call, signature, broadcast, verification submission, or deployment.

The checked-in manifest remains undeployed, with network action disabled.

## 1. Freeze the input

Start from the exact reviewed commit and a clean tree. Record:

```bash
git rev-parse HEAD
git status --short
node --version
forge --version
forge config --root contracts --json
```

The accepted build inputs are:

| Input | Required value |
| --- | --- |
| Node.js | 24 |
| Foundry in GitHub Verify | 1.8.1 |
| Solidity | `0.8.28+commit.7893614a` |
| Optimizer | enabled, 200 runs |
| IR pipeline | enabled |
| EVM version | Cancun |
| OpenZeppelin Contracts | 5.6.1 from `package-lock.json` |
| Contract target | `contracts/src/swap/ConditionalLock.sol:ConditionalLock` |

A different source byte, path, import, dependency, compiler build, setting, metadata choice, constructor value, or toolchain version is a different verification target.

## 2. Restore and build

Stage the pinned toolchain and dependencies before entering an offline verification environment. Then run:

```bash
npm ci --ignore-scripts
forge fmt --root contracts --check
forge build --root contracts --offline --force --sizes
forge test --root contracts --offline -vvv
```

The canonical artifact is:

```text
contracts/out/ConditionalLock.sol/ConditionalLock.json
```

Preserve that artifact, `contracts/foundry.toml`, `package-lock.json`, the full source tree named by `rawMetadata.sources`, the exact Git commit, and the command output. File hashes alone do not replace the source bytes.

## 3. Preserve compiler input and metadata

The artifact's `rawMetadata` records the compiler release, remappings, optimizer, IR, EVM version, compilation target, and source-unit Keccak hashes. Save the exact raw metadata bytes and hash the saved artifact with SHA-256.

For an authorized verification packet, generate and preserve the Standard JSON input with the exact local Solidity binary. `--show-standard-json-input` prints compiler input and does not submit verification:

```bash
forge verify-contract 0x0000000000000000000000000000000000000001 src/swap/ConditionalLock.sol:ConditionalLock --root contracts --show-standard-json-input --use <exact-local-solc-0.8.28-path>
```

Save the output without reformatting it. Record its safe relative path and SHA-256 in the manifest. Do not let the command resolve or download a compiler during an offline reproduction.

Solidity metadata is part of the runtime bytecode by default. Whitespace, source paths, and settings can therefore change the bytecode even when executable Solidity statements appear unchanged.

## 4. Encode the constructor packet

The ABI order is fixed:

```text
constructor(bytes32 swapId, bytes32 termsHash, address token, address funder, address claimRecipient, address refundRecipient, uint256 amount, bytes32 hashlock, uint64 fundingCutoff, uint64 claimCutoff, uint64 refundTime)
```

Encode the eleven reviewed values offline:

```bash
cast abi-encode "constructor(bytes32,bytes32,address,address,address,address,uint256,bytes32,uint64,uint64,uint64)" <swapId> <termsHash> <token> <funder> <claimRecipient> <refundRecipient> <amount> <hashlock> <fundingCutoff> <claimCutoff> <refundTime>
```

The TypeScript function `encodeConditionalLockConstructorArgs` provides an independent encoder with role, amount, fixed-width, and deadline checks. Its output must equal the `cast abi-encode` output byte for byte.

Before any user sees a funding action, compare every decoded constructor value with the wallet-approved fill. Confirm that the refund recipient equals the funder, the token is the exact current contract for the selected chain, and the three timestamps are strictly ordered.

## 5. Match creation code and transaction input

Read `bytecode.object` from the canonical artifact. This is the creation bytecode before constructor arguments.

Construct expected init code as:

```text
expected init code = creation bytecode || ABI-encoded constructor arguments
```

For a later authorized deployment, require the creation transaction input to equal the expected init code byte for byte. Record the raw creation bytecode, raw constructor arguments, their individual SHA-256 hashes, and the combined init-code SHA-256. The manifest validator recomputes these relationships.

A transaction hash or successful receipt alone does not prove the constructor or bytecode.

## 6. Match runtime code

Read `deployedBytecode.object` and `deployedBytecode.immutableReferences` from the artifact. The artifact runtime is a template because the eleven constructor values are embedded as immutables.

Do not compare an unpatched runtime template hash with live code. For a later authorized deployment:

1. Obtain the receipt and runtime bytes for the exact receipt address.
2. Confirm receipt success, chain identity, block hash, and contract address.
3. Reproduce the compile from the preserved Standard JSON input.
4. Apply the exact constructor immutables through the compiler verification flow.
5. Require byte-for-byte equality with the observed runtime.
6. Record the observed runtime bytes and SHA-256, then set each verification flag only after its evidence passes.

No RPC request is part of this workstream. Until independently supplied chain evidence is checked, the runtime, receipt, address, and verification fields remain absent or false.

## 7. Validate the record

Run:

```bash
node scripts/validate-conditional-lock-manifest.mjs contracts/manifests/conditional-lock.not-deployed.json
node --test scripts/validate-conditional-lock-manifest.test.mjs
```

The validator rejects network enablement, unverified deployed records, unsafe paths, malformed or zero identities, missing terms, mismatched byte hashes, incorrect init code, inconsistent roles, invalid deadline order, unsupported compiler settings, extra fields, and secret-looking content.

## 8. Release stop conditions

Stop if the working tree is dirty, the reviewed commit moved, a source or dependency hash differs, the exact compiler is unavailable, the constructor packet differs, the token identity is not current, the transaction input differs, immutable runtime reconstruction differs, chain evidence conflicts, a verification flag lacks evidence, or any deployment field is present while the record says undeployed.

Publication of source verification, a testnet deployment, a mainnet deployment, a wallet signature, and a transaction broadcast each require separate explicit authorization.
