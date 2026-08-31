import assert from "node:assert/strict";
import test from "node:test";

import { bytesToHex, hexToBytes } from "./keccak.ts";
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
import { buildHtlcRedeemScript, htlcP2shScriptPubKey } from "./zcash-htlc.ts";

function fixtureManifest(): UnsignedTransparentManifest {
  const redeemScript = buildHtlcRedeemScript({
    digest: hexToBytes("00".repeat(32)),
    claimPkh: hexToBytes("11".repeat(20)),
    refundPkh: hexToBytes("22".repeat(20)),
    lock: { type: "height", value: 4_300_000 },
  });
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
      { role: "contract", valueZatoshis: "100000", scriptPubKeyHex: bytesToHex(htlcP2shScriptPubKey(redeemScript)) },
    ],
    feeZatoshis: "10000",
    authorization: {
      sighashType: "SIGHASH_ALL",
      sighashCode: 1,
      txModifiable: 0,
      branch: "fund",
      redeemScriptHex: bytesToHex(redeemScript),
      refundSafetyMargin: { type: "height", value: 10 },
      fundingLockCutoff: 4_200_000,
    },
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
  assert.equal(artifact.manifestDigest, "f48cd6bf0aa05d4ea340f15827cbd8033d662921d8c09b3265118dad7789d6cc");
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
    manifest: {
      ...artifact.manifest,
      inputs: [{ ...artifact.manifest.inputs[0], txid: "12".repeat(32) }],
    },
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

test("validates every runtime manifest field before committing", () => {
  assert.throws(
    () => commitZcashArtifact({ ...fixtureManifest(), inputs: [{ ...fixtureManifest().inputs[0], sequence: 0xffff_fffe }] }),
    /sequence does not match/,
  );
  assert.throws(
    () => commitZcashArtifact({ ...fixtureManifest(), targetHeight: 4_133_999, expiryHeight: 4_200_000 }),
    /precedes its NU6.3/,
  );
  assert.throws(
    () => commitZcashArtifact({ ...fixtureManifest(), outputs: [{ ...fixtureManifest().outputs[0], valueZatoshis: "99999" }] }),
    /outputs plus fee/,
  );
  assert.throws(
    () => commitZcashArtifact({
      ...fixtureManifest(),
      profile: { ...fixtureManifest().profile, versionGroupId: "d884b698" },
    }),
    /version group/,
  );
  assert.throws(
    () => commitZcashArtifact({
      ...fixtureManifest(),
      profile: { ...fixtureManifest().profile, coinType: 133 },
    }),
    /coin type must be 1/,
  );
  assert.throws(
    () => commitZcashArtifact({
      ...fixtureManifest(),
      authorization: { ...fixtureManifest().authorization, txModifiable: 1 as 0 },
    }),
    /freeze SIGHASH_ALL/,
  );
  assert.throws(
    () => commitZcashArtifact({
      ...fixtureManifest(),
      authorization: {
        ...fixtureManifest().authorization,
        refundSafetyMargin: { type: "height", value: 10, extra: true } as never,
      },
    }),
    /refund safety margin contains missing or unexpected fields/,
  );
});
