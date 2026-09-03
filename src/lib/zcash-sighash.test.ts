import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  ZCASH_ARTIFACT_BOUNDARY,
  ZCASH_ARTIFACT_SCHEMA,
  commitZcashArtifact,
  createArtifactConstructionPolicy,
  serializeZcashArtifact,
  type CommittedZcashArtifact,
  type UnsignedTransparentManifest,
} from "./zcash-artifact.ts";
import { createZip317TransparentPolicy } from "./zcash-fees.ts";
import { computeTransparentSighash } from "./zcash-sighash.ts";

type FixtureInput = Readonly<{
  txid: string;
  outputIndex: number;
  sequence: number;
  valueZatoshis: string;
  scriptPubKeyHex: string;
}>;

type FixtureOutput = Readonly<{
  role: "contract" | "recipient" | "change";
  valueZatoshis: string;
  scriptPubKeyHex: string;
}>;

type FixtureVector = Readonly<{
  name: string;
  kind: "fund" | "claim" | "refund";
  network: "mainnet" | "testnet";
  transactionVersion: 5 | 6;
  versionGroupId: string;
  consensusBranchId: string;
  targetHeight: number;
  expiryHeight: number;
  lockTime: number;
  feeZatoshis: string;
  inputs: readonly FixtureInput[];
  outputs: readonly FixtureOutput[];
  inputIndex: number;
  expectedSighash: `0x${string}`;
}>;

type FixtureDocument = Readonly<{
  provenance: Readonly<{ algorithm: string; source: string; officialGenerator: string }>;
  vectors: readonly FixtureVector[];
}>;

const fixtureDocument = JSON.parse(
  readFileSync(new URL("../../tests/fixtures/zip244-v5/zip244-v5-vectors.json", import.meta.url), "utf8"),
) as FixtureDocument;

// This is the HTLC redeem script whose P2SH scriptPubKey is present in the
// vectors.  It is deliberately kept separate: ZIP 244 hashes scriptPubKey,
// never the redeemScript supplied to a P2SH signer.
const REDEEM_SCRIPT_HEX =
  "6382012088a82066687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f29258876a91411111111111111111111111111111111111111116703e09c41b17576a91422222222222222222222222222222222222222226888ac";
const PREIMAGE_HEX = "00".repeat(32);
const P2SH_SCRIPT_HEX = "a914789e2c698bcb75afdb66435ba876e6a5c94b5ae387";

function artifactFor(vector: FixtureVector): CommittedZcashArtifact {
  const feePolicy = createZip317TransparentPolicy({
    maximumFeeZatoshis: 50_000n,
    minimumOutputZatoshis: 10_000n,
    maximumSerializedTransactionBytes: 10_000,
  });
  const fee = BigInt(vector.feeZatoshis);
  const policy = createArtifactConstructionPolicy({
    feePolicy,
    finalizedSize: {
      inputBytes: 150 * vector.inputs.length,
      outputBytes: 34 * vector.outputs.length,
    },
    feeZatoshis: fee,
    ...(vector.kind === "fund" ? {} : { observedHeight: vector.targetHeight }),
    ...(vector.kind === "refund"
      ? {
        refundMaturity: {
          lockType: "height" as const,
          currentBlockHeight: vector.targetHeight,
          medianTimePast: null,
        },
      }
      : {}),
  });
  const authorization: UnsignedTransparentManifest["authorization"] = vector.kind === "fund"
    ? {
      sighashType: "SIGHASH_ALL",
      sighashCode: 1,
      txModifiable: 0,
      branch: "fund",
      redeemScriptHex: REDEEM_SCRIPT_HEX,
      refundSafetyMargin: { type: "height", value: 10 },
      fundingLockCutoff: vector.targetHeight,
    }
    : vector.kind === "claim"
      ? {
        sighashType: "SIGHASH_ALL",
        sighashCode: 1,
        txModifiable: 0,
        branch: "claim",
        redeemScriptHex: REDEEM_SCRIPT_HEX,
        preimageHex: PREIMAGE_HEX,
      }
      : {
        sighashType: "SIGHASH_ALL",
        sighashCode: 1,
        txModifiable: 0,
        branch: "refund",
        redeemScriptHex: REDEEM_SCRIPT_HEX,
      };

  return commitZcashArtifact({
    schema: ZCASH_ARTIFACT_SCHEMA,
    boundary: ZCASH_ARTIFACT_BOUNDARY,
    kind: vector.kind,
    network: vector.network,
    profile: {
      id: `zcash-${vector.network}-nu6.3-v${vector.transactionVersion}`,
      transactionVersion: vector.transactionVersion,
      versionGroupId: vector.versionGroupId,
      consensusBranchId: vector.consensusBranchId,
      coinType: vector.network === "mainnet" ? 133 : 1,
    },
    targetHeight: vector.targetHeight,
    expiryHeight: vector.expiryHeight,
    lockTime: vector.lockTime,
    inputs: vector.inputs,
    outputs: vector.outputs,
    feeZatoshis: vector.feeZatoshis,
    policy,
    authorization,
    transactionIdState: "unresolved-until-canonical-transaction-extraction",
  });
}

function vector(name: string): FixtureVector {
  const found = fixtureDocument.vectors.find((entry) => entry.name === name);
  if (!found) throw new Error(`Missing ZIP 244 fixture ${name}`);
  return found;
}

function recommit(
  artifact: CommittedZcashArtifact,
  mutate: (manifest: UnsignedTransparentManifest) => UnsignedTransparentManifest,
): CommittedZcashArtifact {
  return commitZcashArtifact(mutate(artifact.manifest));
}

test("matches independent ZIP 244 vectors for both networks and fund/claim/refund lab artifacts", () => {
  assert.match(fixtureDocument.provenance.algorithm, /independent Python hashlib\.blake2b/);
  assert.match(fixtureDocument.provenance.source, /zip-0244/);
  assert.match(fixtureDocument.provenance.officialGenerator, /zcash-test-vectors/);

  for (const fixture of fixtureDocument.vectors) {
    const artifact = artifactFor(fixture);
    assert.equal(computeTransparentSighash(artifact, fixture.inputIndex), fixture.expectedSighash, fixture.name);
    assert.equal(
      computeTransparentSighash(serializeZcashArtifact(artifact), fixture.inputIndex),
      fixture.expectedSighash,
      `${fixture.name} serialized input`,
    );
  }
});

test("commits all inputs, outputs, the selected input index, and expiry height", () => {
  const fund = artifactFor(vector("fund-mainnet-two-input"));
  const claim = artifactFor(vector("claim-testnet-p2sh"));
  assert.notEqual(
    computeTransparentSighash(fund, 0),
    computeTransparentSighash(fund, 1),
    "selected input index changes the per-input commitment",
  );
  const changed: ReadonlyArray<readonly [string, CommittedZcashArtifact, CommittedZcashArtifact, number]> = [
    [
      "first input txid",
      fund,
      recommit(fund, (manifest) => ({
        ...manifest,
        inputs: [{ ...manifest.inputs[0], txid: "06".repeat(32) }, manifest.inputs[1]],
      })),
      1,
    ],
    [
      "first input output index",
      fund,
      recommit(fund, (manifest) => ({
        ...manifest,
        inputs: [{ ...manifest.inputs[0], outputIndex: manifest.inputs[0].outputIndex + 1 }, manifest.inputs[1]],
      })),
      1,
    ],
    [
      "first input amount",
      fund,
      recommit(fund, (manifest) => ({
        ...manifest,
        inputs: [{ ...manifest.inputs[0], valueZatoshis: "140001" }, manifest.inputs[1]],
        feeZatoshis: "10001",
      })),
      1,
    ],
    [
      "first input scriptPubKey",
      fund,
      recommit(fund, (manifest) => ({
        ...manifest,
        inputs: [{ ...manifest.inputs[0], scriptPubKeyHex: "76a914666666666666666666666666666666666666666688ac" }, manifest.inputs[1]],
      })),
      1,
    ],
    [
      "selected input outpoint",
      fund,
      recommit(fund, (manifest) => ({
        ...manifest,
        inputs: [manifest.inputs[0], { ...manifest.inputs[1], outputIndex: manifest.inputs[1].outputIndex + 1 }],
      })),
      1,
    ],
    [
      "selected input amount",
      fund,
      recommit(fund, (manifest) => ({
        ...manifest,
        inputs: [manifest.inputs[0], { ...manifest.inputs[1], valueZatoshis: "90001" }],
        feeZatoshis: "10001",
      })),
      1,
    ],
    [
      "selected input scriptPubKey",
      fund,
      recommit(fund, (manifest) => ({
        ...manifest,
        inputs: [manifest.inputs[0], { ...manifest.inputs[1], scriptPubKeyHex: "76a914777777777777777777777777777777777777777788ac" }],
      })),
      1,
    ],
    [
      "expiry height",
      claim,
      recommit(claim, (manifest) => ({ ...manifest, expiryHeight: manifest.expiryHeight + 1 })),
      0,
    ],
    [
      "output amount",
      fund,
      recommit(fund, (manifest) => ({
        ...manifest,
        outputs: [manifest.outputs[0], { ...manifest.outputs[1], valueZatoshis: "39999" }],
        feeZatoshis: "10001",
      })),
      1,
    ],
    [
      "output scriptPubKey",
      fund,
      recommit(fund, (manifest) => ({
        ...manifest,
        outputs: [manifest.outputs[0], { ...manifest.outputs[1], scriptPubKeyHex: "76a914666666666666666666666666666666666666666688ac" }],
      })),
      1,
    ],
  ];

  for (const [label, baseline, artifact, inputIndex] of changed) {
    assert.notEqual(
      computeTransparentSighash(artifact, inputIndex),
      computeTransparentSighash(baseline, inputIndex),
      label,
    );
  }
});

test("uses the P2SH scriptPubKey commitment and ignores policy metadata", () => {
  const claim = artifactFor(vector("claim-testnet-p2sh"));
  assert.equal(claim.manifest.inputs[0].scriptPubKeyHex, P2SH_SCRIPT_HEX);
  assert.notEqual(claim.manifest.inputs[0].scriptPubKeyHex, claim.manifest.authorization.redeemScriptHex);

  const baseline = computeTransparentSighash(claim, 0);
  const policyOnly = recommit(claim, (manifest) => ({
    ...manifest,
    policy: {
      ...manifest.policy,
      feePolicy: { ...manifest.policy.feePolicy, maximumFeeZatoshis: "50001" },
    },
  }));
  assert.equal(computeTransparentSighash(policyOnly, 0), baseline);

  assert.throws(
    () => recommit(claim, (manifest) => ({
      ...manifest,
      inputs: [{ ...manifest.inputs[0], scriptPubKeyHex: manifest.authorization.redeemScriptHex! }],
    })),
    /Spend contract input does not match/,
  );
});

test("rejects v6, invalid indexes, malformed envelopes, and coinbase outpoints", () => {
  const fixture = vector("fund-mainnet-two-input");
  const artifact = artifactFor(fixture);
  for (const inputIndex of [-1, 2, 1.5, Number.NaN]) {
    assert.throws(() => computeTransparentSighash(artifact, inputIndex), /input index is out of range/);
  }

  const v6 = artifactFor({ ...fixture, transactionVersion: 6, versionGroupId: "d884b698" });
  assert.throws(() => computeTransparentSighash(v6, 0), /only v5 ZIP 244/);

  const serialized = serializeZcashArtifact(artifact);
  assert.throws(() => computeTransparentSighash("", 0), /not valid JSON|surrounding whitespace/);
  assert.throws(() => computeTransparentSighash(serialized.slice(0, -1), 0), /not valid JSON/);
  assert.throws(() => computeTransparentSighash(` ${serialized}`, 0), /surrounding whitespace/);
  assert.throws(() => computeTransparentSighash({} as never, 0), /Artifact envelope/);

  const coinbase = recommit(artifact, (manifest) => ({
    ...manifest,
    inputs: [{ ...manifest.inputs[0], txid: "00".repeat(32), outputIndex: 0xffff_ffff }, manifest.inputs[1]],
  }));
  assert.throws(() => computeTransparentSighash(coinbase, 0), /Coinbase inputs are not supported/);
});

test("rejects a tampered committed digest and does not accept redeemScript as a raw hash input", () => {
  const artifact = artifactFor(vector("refund-mainnet-p2sh"));
  const parsed = JSON.parse(serializeZcashArtifact(artifact)) as {
    manifest: { inputs: FixtureInput[] };
    manifestDigest: string;
  };
  parsed.manifest.inputs[0] = { ...parsed.manifest.inputs[0], txid: "05".repeat(32) };
  const tampered = JSON.stringify(parsed);
  assert.throws(() => computeTransparentSighash(tampered, 0), /not canonical JSON|digest does not match/);

  assert.throws(
    () => computeTransparentSighash(REDEEM_SCRIPT_HEX, 0),
    /not valid JSON/,
  );
});
