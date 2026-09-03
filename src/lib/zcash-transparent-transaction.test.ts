import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  commitZcashArtifact,
  createArtifactConstructionPolicy,
  serializeZcashArtifact,
  type ArtifactInput,
  type CommittedZcashArtifact,
} from "./zcash-artifact.ts";
import { createZip317TransparentPolicy } from "./zcash-fees.ts";
import { serializeUnsignedV5TransparentTransaction } from "./zcash-transparent-transaction.ts";
import {
  artifactFor,
  fixtureDocument as fixtures,
  vector as fixture,
} from "../../tests/fixtures/zip244-v5/artifact-fixture.ts";

type WireVector = Readonly<{
  name: string;
  inputCount: number;
  outputCount: number;
  wireHex: string;
}>;
type WireDocument = Readonly<{
  algorithm: string;
  source: string;
  vectors: readonly WireVector[];
}>;

const wireFixtures = JSON.parse(
  readFileSync(new URL("../../tests/fixtures/zip244-v5/v5-wire-vectors.json", import.meta.url), "utf8"),
) as WireDocument;

function wireFixture(name: string): WireVector {
  const value = wireFixtures.vectors.find((entry) => entry.name === name);
  if (!value) throw new Error(`Missing wire oracle ${name}`);
  return value;
}

function reverseHex(value: string): string {
  return value.match(/../g)!.reverse().join("");
}

function boundaryArtifact(inputCount: number): CommittedZcashArtifact {
  const base = artifactFor(fixture("fund-mainnet-two-input"));
  const value = 10_000n;
  const fee = 5_000n * BigInt(inputCount);
  const policy = createArtifactConstructionPolicy({
    feePolicy: createZip317TransparentPolicy({
      maximumFeeZatoshis: 2_000_000n,
      minimumOutputZatoshis: 10_000n,
      maximumSerializedTransactionBytes: 100_000,
    }),
    finalizedSize: { inputBytes: 150 * inputCount, outputBytes: 34 },
    feeZatoshis: fee,
  });
  const scriptPubKeyHex = "76a914" + "66".repeat(20) + "88ac";
  const inputs = Array.from({ length: inputCount }, (_, index) => ({
    txid: index.toString(16).padStart(64, "0"),
    outputIndex: index,
    sequence: 0xffff_ffff,
    valueZatoshis: value.toString(),
    scriptPubKeyHex,
  }));
  return commitZcashArtifact({
    ...base.manifest,
    inputs,
    outputs: [{
      ...base.manifest.outputs[0],
      valueZatoshis: (value * BigInt(inputCount) - fee).toString(),
    }],
    feeZatoshis: fee.toString(),
    policy,
  });
}

test("matches independent v5 wire vectors for funding, claim, and refund", () => {
  assert.match(wireFixtures.algorithm, /independent Python/);
  assert.match(wireFixtures.source, /zcash-test-vectors\/blob\/113b3914/);
  for (const vector of fixtures.vectors) {
    const expected = wireFixture(vector.name);
    const artifact = artifactFor(vector);
    const actual = serializeUnsignedV5TransparentTransaction(artifact);
    assert.ok(actual instanceof Uint8Array);
    assert.equal(Buffer.from(actual).toString("hex"), expected.wireHex, vector.name);
    assert.equal(expected.inputCount, vector.inputs.length, `${vector.name} input count`);
    assert.equal(expected.outputCount, vector.outputs.length, `${vector.name} output count`);
    assert.equal(
      Buffer.from(serializeUnsignedV5TransparentTransaction(serializeZcashArtifact(artifact))).toString("hex"),
      expected.wireHex,
      `${vector.name} serialized artifact input`,
    );
  }
});

test("writes the v5 header, protocol byte order, empty scriptSigs, and three zero shielded counts", () => {
  const vector = fixture("fund-mainnet-two-input");
  const bytes = Buffer.from(serializeUnsignedV5TransparentTransaction(artifactFor(vector)));
  assert.equal(bytes.subarray(0, 20).toString("hex"), "050000800a27a7265b16a53700000000f4673500");
  assert.equal(bytes[20], 2);

  const firstInput = bytes.subarray(21, 62);
  assert.equal(firstInput.subarray(0, 32).toString("hex"), reverseHex(vector.inputs[0].txid));
  assert.equal(firstInput.subarray(32, 36).toString("hex"), "04030201");
  assert.equal(firstInput[36], 0, "scriptSig CompactSize is empty");
  assert.equal(firstInput.subarray(37, 41).toString("hex"), "ffffffff");

  const outputCountOffset = 20 + 1 + 41 * vector.inputs.length;
  assert.equal(bytes[outputCountOffset], 2);
  const firstOutput = bytes.subarray(outputCountOffset + 1, outputCountOffset + 1 + 32);
  assert.equal(firstOutput.subarray(0, 8).toString("hex"), "20bf020000000000");
  assert.equal(firstOutput[8], 0x17, "P2SH scriptPubKey CompactSize is 23");
  assert.equal(firstOutput.subarray(9).toString("hex"), vector.outputs[0].scriptPubKeyHex);
  assert.equal(bytes.subarray(-3).toString("hex"), "000000");
});

test("uses canonical CompactSize at the 252/253 input boundary within the artifact cap", () => {
  for (const [inputCount, prefix] of [[252, "fc"], [253, "fdfd00"]] as const) {
    const bytes = Buffer.from(serializeUnsignedV5TransparentTransaction(boundaryArtifact(inputCount)));
    assert.equal(bytes.subarray(20, 20 + prefix.length / 2).toString("hex"), prefix, `${inputCount} input prefix`);
    const expectedLength = 20 + prefix.length / 2 + inputCount * 41 + 1 + 32 + 3;
    assert.equal(bytes.length, expectedLength, `${inputCount} input length`);
    assert.equal(bytes.subarray(-3).toString("hex"), "000000", `${inputCount} trailing counts`);
    const lastInputOffset = 20 + prefix.length / 2 + (inputCount - 1) * 41;
    const lastTxid = (inputCount - 1).toString(16).padStart(64, "0");
    assert.equal(bytes.subarray(lastInputOffset, lastInputOffset + 32).toString("hex"), reverseHex(lastTxid));
  }
});

test("returns fresh bytes and leaves artifact readiness unchanged", () => {
  const artifact = artifactFor(fixture("claim-testnet-p2sh"));
  const before = serializeZcashArtifact(artifact);
  const first = serializeUnsignedV5TransparentTransaction(artifact);
  const second = serializeUnsignedV5TransparentTransaction(artifact);
  assert.notStrictEqual(first, second);
  first[0] ^= 0xff;
  assert.equal(Buffer.from(second).toString("hex"), wireFixture("claim-testnet-p2sh").wireHex);
  assert.equal(serializeZcashArtifact(artifact), before);
  assert.equal(artifact.manifest.transactionIdState, "unresolved-until-canonical-transaction-extraction");
});

test("rejects v6, coinbase, and tampered artifact envelopes", () => {
  const vector = fixture("fund-mainnet-two-input");
  const artifact = artifactFor(vector);
  const v6 = artifactFor({ ...vector, transactionVersion: 6, versionGroupId: "d884b698" });
  assert.throws(
    () => serializeUnsignedV5TransparentTransaction(v6),
    /supports only v5/,
  );

  const coinbase = commitZcashArtifact({
    ...artifact.manifest,
    inputs: [{ ...artifact.manifest.inputs[0], txid: "00".repeat(32), outputIndex: 0xffff_ffff }, artifact.manifest.inputs[1]],
  });
  assert.throws(
    () => serializeUnsignedV5TransparentTransaction(coinbase),
    /Coinbase inputs are not supported/,
  );

  const parsed = JSON.parse(serializeZcashArtifact(artifact)) as {
    manifest: { inputs: ArtifactInput[] };
  };
  parsed.manifest.inputs[0] = { ...parsed.manifest.inputs[0], txid: "ab".repeat(32) };
  assert.throws(
    () => serializeUnsignedV5TransparentTransaction(JSON.stringify(parsed)),
    /digest does not match/,
  );
});
