import assert from "node:assert/strict";
import test from "node:test";

import { hexToBytes } from "./keccak.ts";
import { createZip317TransparentPolicy } from "./zcash-fees.ts";
import { buildFundingArtifact, type FundingArtifactRequest } from "./zcash-funding.ts";
import { buildHtlcRedeemScript } from "./zcash-htlc.ts";
import { createNu63EncodingProfile } from "./zcash-transaction-policy.ts";
import { transparentScriptPubKey } from "./zcash-transparent.ts";

const SOURCE = "tm9ihrdmC2s27JKHjgoG55hiwrCbBpoM4ec";
const CHANGE = SOURCE;

function fixture(overrides: Partial<FundingArtifactRequest> = {}): FundingArtifactRequest {
  const network = "testnet";
  const redeemScript = buildHtlcRedeemScript({
    digest: hexToBytes("00".repeat(32)),
    claimPkh: hexToBytes("11".repeat(20)),
    refundPkh: hexToBytes("22".repeat(20)),
    lock: { type: "height", value: 4_300_000 },
  });
  const request: FundingArtifactRequest = {
    profile: createNu63EncodingProfile({ network, transactionVersion: 5, coinType: 1 }),
    targetHeight: 4_200_000,
    expiryHeight: 4_200_020,
    inputs: [
      {
        txid: "33".repeat(32),
        outputIndex: 1,
        valueZatoshis: 130_000n,
        address: SOURCE,
        scriptPubKey: transparentScriptPubKey(SOURCE, network),
      },
    ],
    redeemScript,
    contractValueZatoshis: 100_000n,
    changeAddress: CHANGE,
    feeZatoshis: 10_000n,
    feePolicy: createZip317TransparentPolicy({
      maximumFeeZatoshis: 50_000n,
      minimumOutputZatoshis: 10_000n,
      maximumSerializedTransactionBytes: 10_000,
    }),
    finalizedSizeWithoutChange: { inputBytes: 150, outputBytes: 34 },
    finalizedSizeWithChange: { inputBytes: 150, outputBytes: 68 },
    belowMinimumChange: "reject",
    refundSafetyMargin: { type: "height", value: 10 },
  };
  return { ...request, ...overrides };
}

test("builds a deterministic contract-first funding artifact with explicit change", () => {
  const artifact = buildFundingArtifact(fixture());
  assert.equal(artifact.manifest.kind, "fund");
  assert.equal(artifact.manifest.inputs[0].sequence, 0xffff_ffff);
  assert.deepEqual(artifact.manifest.outputs.map((output) => [output.role, output.valueZatoshis]), [
    ["contract", "100000"],
    ["change", "20000"],
  ]);
  assert.equal(artifact.manifest.feeZatoshis, "10000");
  assert.equal(artifact.manifest.authorization.txModifiable, 0);
  assert.equal(artifact.manifestDigest, "1f5c6c39b394a979f2467e87ae98abcb3a2ab0e47f8e67a3cfc04ab82ee002db");
});

test("rejects wrong-network, mismatched, duplicate, and non-P2PKH funding inputs", () => {
  const base = fixture();
  const wrongNetworkAddress = "t1HsxXoGneCWcA56J24xLE34CFDWNK6RCqD";
  assert.throws(
    () => buildFundingArtifact(fixture({
      inputs: [{ ...base.inputs[0], address: wrongNetworkAddress, scriptPubKey: transparentScriptPubKey(wrongNetworkAddress, "mainnet") }],
    })),
    /wrong Zcash network/,
  );
  assert.throws(
    () => buildFundingArtifact(fixture({ inputs: [{ ...base.inputs[0], scriptPubKey: hexToBytes("51") }] })),
    /does not match/,
  );
  assert.throws(() => buildFundingArtifact(fixture({ inputs: [base.inputs[0], base.inputs[0]] })), /duplicate outpoint/);
  assert.throws(
    () => buildFundingArtifact(fixture({
      inputs: [{
        ...base.inputs[0],
        address: "t2SRyAR26tXTnZHfpa3jPqeyYmxCbAZxUnh",
        scriptPubKey: transparentScriptPubKey("t2SRyAR26tXTnZHfpa3jPqeyYmxCbAZxUnh", "testnet"),
      }],
    })),
    /must be transparent P2PKH/,
  );
});

test("makes below-minimum change an explicit reject or add-to-fee decision", () => {
  const base = fixture();
  const tinyRemainder = [{ ...base.inputs[0], valueZatoshis: 115_000n }];
  assert.throws(() => buildFundingArtifact(fixture({ inputs: tinyRemainder })), /cannot be omitted silently/);

  const artifact = buildFundingArtifact(fixture({
    inputs: tinyRemainder,
    changeAddress: undefined,
    belowMinimumChange: "add-to-fee",
  }));
  assert.deepEqual(artifact.manifest.outputs.map((output) => output.role), ["contract"]);
  assert.equal(artifact.manifest.feeZatoshis, "15000");
});

test("rejects absent change routing, premature expiry, and malformed contract scripts", () => {
  assert.throws(() => buildFundingArtifact(fixture({ changeAddress: undefined })), /change address is required/);
  assert.throws(() => buildFundingArtifact(fixture({ expiryHeight: 4_199_999 })), /earlier than the target/);
  assert.throws(() => buildFundingArtifact(fixture({ redeemScript: hexToBytes("51") })), /Invalid Zcash HTLC/);
});

test("requires a future refund lock with an explicit safety margin", () => {
  const base = fixture();
  const immediateRefund = buildHtlcRedeemScript({
    digest: hexToBytes("00".repeat(32)),
    claimPkh: hexToBytes("11".repeat(20)),
    refundPkh: hexToBytes("22".repeat(20)),
    lock: { type: "height", value: base.targetHeight },
  });
  assert.throws(() => buildFundingArtifact(fixture({ redeemScript: immediateRefund })), /future safety margin/);
  assert.throws(
    () => buildFundingArtifact(fixture({ refundSafetyMargin: { type: "timestamp", value: 10 } })),
    /locktime domain/,
  );

  const timestampRefund = buildHtlcRedeemScript({
    digest: hexToBytes("00".repeat(32)),
    claimPkh: hexToBytes("11".repeat(20)),
    refundPkh: hexToBytes("22".repeat(20)),
    lock: { type: "timestamp", value: 1_800_000_100 },
  });
  assert.throws(
    () => buildFundingArtifact(fixture({
      redeemScript: timestampRefund,
      refundSafetyMargin: { type: "timestamp", value: 100 },
      fundingTimeCutoff: undefined,
    })),
    /Funding time cutoff/,
  );
  assert.doesNotThrow(() => buildFundingArtifact(fixture({
    redeemScript: timestampRefund,
    refundSafetyMargin: { type: "timestamp", value: 100 },
    fundingTimeCutoff: 1_800_000_000,
  })));
});
