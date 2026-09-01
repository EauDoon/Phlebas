import { strict as assert } from "node:assert";
import { test } from "node:test";

import { hexToBytes } from "./keccak.ts";
import {
  canonicalMainnetSwapTerms,
  fixturePreimage,
  fixtureSecretHash,
  fundedZecSwap,
} from "./swap-test-fixtures.ts";
import { createZip317TransparentPolicy } from "./zcash-fees.ts";
import {
  buildTermsBoundZcashClaimArtifact,
  buildTermsBoundZcashFundingArtifact,
  buildTermsBoundZcashRefundArtifact,
  type TermsBoundClaimArtifactRequest,
  type TermsBoundFundingArtifactRequest,
  type TermsBoundRefundArtifactRequest,
} from "./zcash-bound-artifacts.ts";
import {
  createBoundWalletReviewRequest,
  parseBoundWalletReviewRequest,
  serializeBoundWalletReviewRequest,
  verifyBoundWalletReviewRequest,
} from "./zcash-bound-pczt.ts";
import { createPcztEnvelope, walletPcztReadiness } from "./zcash-pczt.ts";
import { createNu63EncodingProfile } from "./zcash-transaction-policy.ts";
import { encodeTransparentAddress, transparentScriptPubKey } from "./zcash-transparent.ts";

const SOURCE = encodeTransparentAddress("mainnet", "p2pkh", hexToBytes("77".repeat(20)));
const PROFILE = createNu63EncodingProfile({ network: "mainnet", transactionVersion: 5, coinType: 133 });
const FEE_POLICY = createZip317TransparentPolicy({
  maximumFeeZatoshis: 50_000n,
  minimumOutputZatoshis: 10_000n,
  maximumSerializedTransactionBytes: 10_000,
});

function fundingRequest(overrides: Partial<TermsBoundFundingArtifactRequest> = {}): TermsBoundFundingArtifactRequest {
  const terms = canonicalMainnetSwapTerms();
  const request: TermsBoundFundingArtifactRequest = {
    terms,
    profile: PROFILE,
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
    feePolicy: FEE_POLICY,
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

function claimRequest(overrides: Partial<TermsBoundClaimArtifactRequest> = {}): TermsBoundClaimArtifactRequest {
  const terms = canonicalMainnetSwapTerms({ secretHash: fixtureSecretHash });
  return {
    state: fundedZecSwap(terms),
    profile: PROFILE,
    targetHeight: 3_500_000,
    expiryHeight: 3_500_020,
    observedHeight: 3_500_000,
    preimage: hexToBytes(fixturePreimage),
    feeZatoshis: 10_000n,
    feePolicy: FEE_POLICY,
    finalizedSize: { inputBytes: 300, outputBytes: 34 },
    ...overrides,
  };
}

function refundRequest(overrides: Partial<TermsBoundRefundArtifactRequest> = {}): TermsBoundRefundArtifactRequest {
  const terms = canonicalMainnetSwapTerms({ secretHash: fixtureSecretHash });
  return {
    state: fundedZecSwap(terms),
    profile: PROFILE,
    targetHeight: 3_500_000,
    expiryHeight: 3_500_020,
    observedHeight: 3_500_000,
    maturity: { currentBlockHeight: 3_500_000, medianTimePast: Number(terms.zecRefundTime) + 1 },
    feeZatoshis: 10_000n,
    feePolicy: FEE_POLICY,
    finalizedSize: { inputBytes: 300, outputBytes: 34 },
    ...overrides,
  };
}

test("derives claim and refund artifacts from confirmed funding and signed recipients", () => {
  const claim = buildTermsBoundZcashClaimArtifact(claimRequest());
  assert.equal(claim.artifact.manifest.kind, "claim");
  assert.equal(claim.artifact.manifest.inputs[0]?.txid, claimRequest().state.zec.funding?.transactionId.slice(2));
  assert.equal(claim.binding.binding.action, "claim");

  const refund = buildTermsBoundZcashRefundArtifact(refundRequest());
  assert.equal(refund.artifact.manifest.kind, "refund");
  assert.equal(refund.artifact.manifest.lockTime.toString(), refund.projection.refundTimeSeconds);
  assert.equal(refund.binding.binding.action, "refund");
  assert.notEqual(refund.artifact.manifest.outputs[0]?.scriptPubKeyHex, claim.artifact.manifest.outputs[0]?.scriptPubKeyHex);
});

test("rejects wrong preimages, early refunds, and unconfirmed or mutated funding facts", () => {
  assert.throws(
    () => buildTermsBoundZcashClaimArtifact(claimRequest({ preimage: hexToBytes("99".repeat(32)) })),
    /does not match/,
  );
  assert.throws(
    () => buildTermsBoundZcashRefundArtifact(refundRequest({
      maturity: { currentBlockHeight: 3_500_000, medianTimePast: 1_000_000_000 },
    })),
    /early/,
  );
  const confirmed = claimRequest().state;
  assert.throws(
    () => buildTermsBoundZcashClaimArtifact(claimRequest({ state: { ...confirmed, zec: { phase: "unfunded" } } })),
    /confirmed canonical ZEC funding|integrity/,
  );
  assert.throws(
    () => buildTermsBoundZcashClaimArtifact(claimRequest({
      state: {
        ...confirmed,
        zec: {
          ...confirmed.zec,
          funding: confirmed.zec.funding && { ...confirmed.zec.funding, amountAtoms: confirmed.zec.funding.amountAtoms - 1n },
        },
      },
    })),
    /integrity|fact ID|signed settlement projection/,
  );
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

test("binds PCZT review bytes to exact swap terms while keeping release blocked", () => {
  const bound = buildTermsBoundZcashFundingArtifact(fundingRequest());
  const pczt = createPcztEnvelope(Uint8Array.of(0x50, 0x43, 0x5a, 0x54, 2, 0, 0, 0, 0xaa));
  const review = createBoundWalletReviewRequest({ boundArtifact: bound, pczt });
  verifyBoundWalletReviewRequest(review);
  assert.equal(review.releaseState, "blocked");
  assert.equal(review.settlementBinding.binding.swapId, bound.projection.swapId);
  assert.equal(review.walletReview.manifestDigest, bound.artifact.manifestDigest);
  assert.match(review.blockers.join(","), /full-zip374.*wallet-htlc-lifecycle.*relayability/);
  assert.equal(walletPcztReadiness({
    customTransparentInputs: "proven",
    customP2shScripts: "proven",
    exactLockTime: "proven",
    exactExpiry: "proven",
    exactOutputs: "proven",
  }).ready, false);
  assert.deepEqual(parseBoundWalletReviewRequest(serializeBoundWalletReviewRequest(review)), review);
});

test("rejects PCZT, manifest, binding, and release-boundary substitution", () => {
  const bound = buildTermsBoundZcashFundingArtifact(fundingRequest());
  const review = createBoundWalletReviewRequest({
    boundArtifact: bound,
    pczt: createPcztEnvelope(Uint8Array.of(0x50, 0x43, 0x5a, 0x54, 2, 0, 0, 0, 0xaa)),
  });
  assert.throws(
    () => verifyBoundWalletReviewRequest({ ...review, releaseState: "ready" } as never),
    /blocked boundary/,
  );
  assert.throws(
    () => verifyBoundWalletReviewRequest({ ...review, blockers: [] } as never),
    /blockers/,
  );
  assert.throws(
    () => verifyBoundWalletReviewRequest({
      ...review,
      settlementBinding: {
        ...review.settlementBinding,
        binding: { ...review.settlementBinding.binding, termsHash: `0x${"99".repeat(32)}` },
      },
    }),
    /digest does not match/,
  );
  assert.throws(
    () => verifyBoundWalletReviewRequest({
      ...review,
      walletReview: { ...review.walletReview, pcztByteSha256: "99".repeat(32) },
    }),
    /PCZT envelope fields|review digest/,
  );
});
