import assert from "node:assert/strict";
import test from "node:test";
import {
  commitZcashArtifact,
  serializeZcashArtifact,
  type ArtifactInput,
  type CommittedZcashArtifact,
  type UnsignedTransparentManifest,
} from "./zcash-artifact.ts";
import { computeTransparentSighash } from "./zcash-sighash.ts";
import {
  artifactFor,
  fixtureDocument,
  REDEEM_SCRIPT_HEX,
  vector,
} from "../../tests/fixtures/zip244-v5/artifact-fixture.ts";

const P2SH_SCRIPT_HEX = "a914789e2c698bcb75afdb66435ba876e6a5c94b5ae387";

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
    manifest: { inputs: ArtifactInput[] };
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
