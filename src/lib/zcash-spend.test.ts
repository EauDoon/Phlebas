import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { hexToBytes } from "./keccak.ts";
import { createZip317TransparentPolicy } from "./zcash-fees.ts";
import { buildHtlcRedeemScript, htlcP2shScriptPubKey, type HtlcParameters } from "./zcash-htlc.ts";
import {
  buildClaimArtifact,
  buildRefundArtifact,
  type ClaimArtifactRequest,
  type RefundArtifactRequest,
} from "./zcash-spend.ts";
import { createNu63EncodingProfile } from "./zcash-transaction-policy.ts";
import { encodeTransparentAddress } from "./zcash-transparent.ts";

const PREIMAGE = hexToBytes("00".repeat(32));
const CLAIM_PKH = hexToBytes("00112233445566778899aabbccddeeff00112233");
const REFUND_PKH = hexToBytes("ffeeddccbbaa99887766554433221100fedcba98");
const HTLC: HtlcParameters = {
  digest: Uint8Array.from(createHash("sha256").update(PREIMAGE).digest()),
  claimPkh: CLAIM_PKH,
  refundPkh: REFUND_PKH,
  lock: { type: "height", value: 4_300_000 },
};
const REDEEM_SCRIPT = buildHtlcRedeemScript(HTLC);
const CLAIM_ADDRESS = encodeTransparentAddress("testnet", "p2pkh", CLAIM_PKH);
const REFUND_ADDRESS = encodeTransparentAddress("testnet", "p2pkh", REFUND_PKH);

function common() {
  return {
    profile: createNu63EncodingProfile({ network: "testnet" as const, transactionVersion: 5 as const, coinType: 1 }),
    targetHeight: 4_300_001,
    expiryHeight: 4_300_021,
    contractUtxo: {
      txid: "44".repeat(32),
      outputIndex: 0,
      valueZatoshis: 110_000n,
      scriptPubKey: htlcP2shScriptPubKey(REDEEM_SCRIPT),
      redeemScript: REDEEM_SCRIPT,
    },
    expectedHtlc: HTLC,
    recipientValueZatoshis: 100_000n,
    feeZatoshis: 10_000n,
    feePolicy: createZip317TransparentPolicy({
      maximumFeeZatoshis: 50_000n,
      minimumOutputZatoshis: 10_000n,
      maximumTransactionBytes: 10_000,
    }),
    finalizedSize: { inputBytes: 260, outputBytes: 34 },
  };
}

function claim(overrides: Partial<ClaimArtifactRequest> = {}): ClaimArtifactRequest {
  return { ...common(), recipientAddress: CLAIM_ADDRESS, preimage: PREIMAGE, ...overrides };
}

function refund(overrides: Partial<RefundArtifactRequest> = {}): RefundArtifactRequest {
  return {
    ...common(),
    recipientAddress: REFUND_ADDRESS,
    maturity: { currentBlockHeight: HTLC.lock.value + 1 },
    ...overrides,
  };
}

test("builds exact claim and mature refund artifacts without key or signature fields", () => {
  const claimArtifact = buildClaimArtifact(claim());
  assert.equal(claimArtifact.manifest.lockTime, 0);
  assert.equal(claimArtifact.manifest.inputs[0].sequence, 0xffff_ffff);
  assert.equal(claimArtifact.manifest.authorization.preimageHex, "00".repeat(32));
  assert.equal(claimArtifact.manifestDigest, "7dce9578b09ba7e5d73dd3d41de840600afb061cb3046881faf8ff8a6df98f1a");

  const refundArtifact = buildRefundArtifact(refund());
  assert.equal(refundArtifact.manifest.lockTime, HTLC.lock.value);
  assert.equal(refundArtifact.manifest.inputs[0].sequence, 0xffff_fffe);
  assert.equal("preimageHex" in refundArtifact.manifest.authorization, false);
  assert.equal(refundArtifact.manifestDigest, "cbe4128d7e1622a078cb2b415e6eed81fa7fddf61876dd0b612335411f7ffeb3");

  const serialized = JSON.stringify([claimArtifact, refundArtifact]);
  assert.doesNotMatch(serialized, /privateKey|secretKey|seed|signatureHex/);
});

test("rejects wrong preimage, network, and committed branch recipient", () => {
  assert.throws(() => buildClaimArtifact(claim({ preimage: hexToBytes("01".repeat(32)) })), /does not match/);
  assert.throws(
    () => buildClaimArtifact(claim({ recipientAddress: encodeTransparentAddress("mainnet", "p2pkh", CLAIM_PKH) })),
    /wrong Zcash network/,
  );
  assert.throws(() => buildClaimArtifact(claim({ recipientAddress: REFUND_ADDRESS })), /claim recipient does not match/);
  assert.throws(() => buildRefundArtifact(refund({ recipientAddress: CLAIM_ADDRESS })), /refund recipient does not match/);
});

test("rejects a substituted contract hash or expected HTLC", () => {
  const base = claim();
  const wrongScript = Uint8Array.from(base.contractUtxo.scriptPubKey);
  wrongScript[2] ^= 1;
  assert.throws(
    () => buildClaimArtifact(claim({ contractUtxo: { ...base.contractUtxo, scriptPubKey: wrongScript } })),
    /does not match the exact HTLC/,
  );
  assert.throws(
    () => buildClaimArtifact(claim({ expectedHtlc: { ...HTLC, claimPkh: REFUND_PKH } })),
    /claim public-key hash does not match/,
  );
});

test("fails closed when refund maturity is absent, equal, or early", () => {
  assert.throws(() => buildRefundArtifact(refund({ maturity: {} })), /unresolved or early/);
  assert.throws(
    () => buildRefundArtifact(refund({ maturity: { currentBlockHeight: HTLC.lock.value } })),
    /strictly greater/,
  );
  assert.throws(
    () => buildRefundArtifact(refund({ maturity: { currentBlockHeight: HTLC.lock.value - 1 } })),
    /strictly greater/,
  );
});

test("requires exact no-change reconciliation and a policy-compliant fee", () => {
  assert.throws(() => buildClaimArtifact(claim({ recipientValueZatoshis: 99_999n })), /plus fee/);
  assert.throws(() => buildClaimArtifact(claim({ feeZatoshis: 5_000n, recipientValueZatoshis: 105_000n })), /below/);
  assert.throws(() => buildClaimArtifact(claim({ recipientValueZatoshis: 9_999n, feeZatoshis: 100_001n })), /minimum output/);
});
