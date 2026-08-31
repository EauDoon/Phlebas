import assert from "node:assert/strict";
import test from "node:test";

import {
  ZCASH_ARTIFACT_BOUNDARY,
  ZCASH_ARTIFACT_SCHEMA,
  canonicalArtifactJson,
  commitZcashArtifact,
  parseZcashArtifact,
  serializeZcashArtifact,
  verifyZcashArtifact,
  type UnsignedTransparentManifest,
} from "./zcash-artifact.ts";

function fixtureManifest(): UnsignedTransparentManifest {
  return {
    schema: ZCASH_ARTIFACT_SCHEMA,
    boundary: ZCASH_ARTIFACT_BOUNDARY,
    kind: "fund",
    network: "testnet",
    profile: {
      id: "zcash-testnet-nu6.3-v5",
      transactionVersion: 5,
      versionGroupId: "26a7270a",
      consensusBranchId: "37a5165b",
      coinType: 1,
    },
    targetHeight: 4_200_000,
    expiryHeight: 4_200_020,
    lockTime: 0,
    inputs: [
      {
        txid: "11".repeat(32),
        outputIndex: 0,
        sequence: 0xffff_ffff,
        valueZatoshis: "110000",
        scriptPubKeyHex: "76a914" + "22".repeat(20) + "88ac",
      },
    ],
    outputs: [
      { role: "contract", valueZatoshis: "100000", scriptPubKeyHex: "a914" + "33".repeat(20) + "87" },
    ],
    feeZatoshis: "10000",
    authorization: { sighashType: "SIGHASH_ALL", sighashCode: 1, txModifiable: 0, branch: "fund" },
    transactionIdState: "unresolved-until-canonical-transaction-extraction",
  };
}

test("canonicalizes object keys and rejects non-canonical values", () => {
  assert.equal(canonicalArtifactJson({ z: 2, a: [true, "x"] }), '{"a":[true,"x"],"z":2}');
  assert.throws(() => canonicalArtifactJson({ unsafe: Number.MAX_SAFE_INTEGER + 1 }), /safe integer/);
  assert.throws(() => canonicalArtifactJson({ missing: undefined } as never), /must not be undefined/);
});

test("commits, freezes, serializes, and rehydrates an exact manifest", () => {
  const artifact = commitZcashArtifact(fixtureManifest());
  assert.equal(artifact.manifestDigest, "74dd288bb2f40c9e0554c4f5a101268e1d7123baabba6073250c3df34a935d32");
  assert.equal(Object.isFrozen(artifact), true);
  assert.equal(Object.isFrozen(artifact.manifest.inputs), true);

  const serialized = serializeZcashArtifact(artifact);
  const rehydrated = parseZcashArtifact(serialized);
  assert.deepEqual(rehydrated, artifact);
  assert.equal(serializeZcashArtifact(rehydrated), serialized);
});

test("fails closed on artifact substitution and non-canonical restart bytes", () => {
  const artifact = commitZcashArtifact(fixtureManifest());
  const substituted = {
    ...artifact,
    manifest: { ...artifact.manifest, feeZatoshis: "9999" },
  };
  assert.throws(() => verifyZcashArtifact(substituted), /digest does not match/);

  const serialized = serializeZcashArtifact(artifact);
  assert.throws(() => parseZcashArtifact(` ${serialized}`), /surrounding whitespace/);
  assert.throws(() => parseZcashArtifact(serialized.replace('{"manifest":', '{ "manifest":')), /not canonical/);

  const unexpected = JSON.parse(serialized) as Record<string, unknown>;
  unexpected.extra = true;
  const unexpectedSerialized = canonicalArtifactJson(unexpected as never);
  assert.throws(() => parseZcashArtifact(unexpectedSerialized), /unexpected fields/);
});
