import { strict as assert } from "node:assert";
import { test } from "node:test";

import { hexToBytes } from "./keccak.ts";
import { canonicalMainnetSwapTerms } from "./swap-test-fixtures.ts";
import { createZip317TransparentPolicy } from "./zcash-fees.ts";
import { buildTermsBoundZcashFundingArtifact, type TermsBoundFundingArtifactRequest } from "./zcash-bound-artifacts.ts";
import { createNu63EncodingProfile } from "./zcash-transaction-policy.ts";
import { encodeTransparentAddress, transparentScriptPubKey } from "./zcash-transparent.ts";

const SOURCE = encodeTransparentAddress("mainnet", "p2pkh", hexToBytes("77".repeat(20)));

function fundingRequest(overrides: Partial<TermsBoundFundingArtifactRequest> = {}): TermsBoundFundingArtifactRequest {
  const terms = canonicalMainnetSwapTerms();
  const request: TermsBoundFundingArtifactRequest = {
    terms,
    profile: createNu63EncodingProfile({ network: "mainnet", transactionVersion: 5, coinType: 133 }),
    targetHeight: 3_500_000,
    expiryHeight: 3_500_020,
    inputs: [{
      txid: "88".repeat(32),
      outputIndex: 1,
      valueZatoshis: terms.zecAmountZatoshis + 30_000n,
      address: SOURCE,
      scriptPubKey: transparentScriptPubKey(SOURCE, "mainnet"),
    }],
    changeAddress: SOURCE,
    feeZatoshis: 10_000n,
    feePolicy: createZip317TransparentPolicy({
      maximumFeeZatoshis: 50_000n,
      minimumOutputZatoshis: 10_000n,
      maximumSerializedTransactionBytes: 10_000,
    }),
    finalizedSizeWithoutChange: { inputBytes: 150, outputBytes: 34 },
    finalizedSizeWithChange: { inputBytes: 150, outputBytes: 68 },
    belowMinimumChange: "reject",
  };
  return { ...request, ...overrides };
}

test("derives the Mainnet funding contract solely from signed swap terms", () => {
  const bound = buildTermsBoundZcashFundingArtifact(fundingRequest());
  assert.equal(bound.artifact.manifest.network, "mainnet");
  assert.equal(bound.artifact.manifest.kind, "fund");
  assert.equal(bound.artifact.manifest.outputs[0]?.valueZatoshis, bound.projection.amountZatoshis);
  assert.equal(bound.artifact.manifest.authorization.redeemScriptHex, bound.projection.redeemScriptHex.slice(2));
  assert.equal(bound.binding.binding.artifactManifestDigest, bound.artifact.manifestDigest);
  assert.equal(bound.binding.binding.swapId, bound.projection.swapId);
  assert.equal(Object.isFrozen(bound), true);
});

test("rejects wrong profiles, unsigned lock changes, and insufficient public UTXO evidence", () => {
  const testnetProfile = createNu63EncodingProfile({ network: "testnet", transactionVersion: 5, coinType: 1 });
  assert.throws(
    () => buildTermsBoundZcashFundingArtifact(fundingRequest({ profile: testnetProfile })),
    /exact Mainnet encoding profile/,
  );
  const exactTerms = canonicalMainnetSwapTerms();
  assert.throws(
    () => buildTermsBoundZcashFundingArtifact(fundingRequest({
      terms: { ...exactTerms, zcashLockScriptHash: `0x${"55".repeat(20)}` },
    })),
    /signed lock script hash/,
  );
  const request = fundingRequest();
  assert.throws(
    () => buildTermsBoundZcashFundingArtifact(fundingRequest({
      inputs: [{ ...request.inputs[0]!, valueZatoshis: request.terms.zecAmountZatoshis }],
    })),
    /do not cover|below the configured conventional fee/,
  );
});

test("ignores attempted runtime overrides of contract amount and redeem script", () => {
  const request = {
    ...fundingRequest(),
    contractValueZatoshis: 1n,
    redeemScript: hexToBytes("51"),
    fundingTimeCutoff: 1,
    refundSafetyMargin: { type: "height", value: 1 },
  } as unknown as TermsBoundFundingArtifactRequest;
  const bound = buildTermsBoundZcashFundingArtifact(request);
  assert.equal(bound.artifact.manifest.outputs[0]?.valueZatoshis, bound.projection.amountZatoshis);
  assert.equal(bound.artifact.manifest.authorization.redeemScriptHex, bound.projection.redeemScriptHex.slice(2));
  assert.equal(bound.artifact.manifest.authorization.fundingLockCutoff, Number(bound.projection.fundingCutoffSeconds));
});
