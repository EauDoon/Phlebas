import assert from "node:assert/strict";
import test from "node:test";

import {
  FINAL_SEQUENCE,
  LOCKTIME_ENABLED_SEQUENCE,
  NU6_3_BRANCH_ID,
  V5_VERSION_GROUP_ID,
  V6_VERSION_GROUP_ID,
  assertArtifactSequence,
  createNu63EncodingProfile,
  evaluateAbsoluteLock,
  evaluateExpiry,
  replacementAssessment,
  sequenceForArtifact,
  validateAbsoluteLock,
  validateExpiryHeight,
  validateTargetHeight,
} from "./zcash-transaction-policy.ts";

test("pins NU6.3 encoding constants without claiming a live chain tip", () => {
  const mainnet = createNu63EncodingProfile({ network: "mainnet", transactionVersion: 5, coinType: 133 });
  const testnet = createNu63EncodingProfile({ network: "testnet", transactionVersion: 6, coinType: 1 });

  assert.deepEqual(mainnet, {
    id: "zcash-mainnet-nu6.3-v5",
    network: "mainnet",
    activationHeight: 3_428_143,
    transactionVersion: 5,
    versionGroupId: V5_VERSION_GROUP_ID,
    consensusBranchId: NU6_3_BRANCH_ID,
    coinType: 133,
  });
  assert.equal(testnet.activationHeight, 4_134_000);
  assert.equal(testnet.versionGroupId, V6_VERSION_GROUP_ID);
  assert.throws(
    () => createNu63EncodingProfile({ network: "mainnet", transactionVersion: 4 as 5, coinType: 133 }),
    /versions 5 and 6/,
  );
  assert.throws(
    () => createNu63EncodingProfile({ network: "mainnet", transactionVersion: 5, coinType: -1 }),
    /unsigned 32-bit/,
  );
});

test("validates target and expiry heights against the selected profile", () => {
  const profile = createNu63EncodingProfile({ network: "mainnet", transactionVersion: 5, coinType: 133 });
  assert.equal(validateTargetHeight(profile, 3_428_143), 3_428_143);
  assert.equal(validateExpiryHeight(profile, 3_428_143, 3_428_163), 3_428_163);
  assert.equal(validateExpiryHeight(profile, 3_428_143, 0), 0);
  assert.throws(() => validateTargetHeight(profile, 3_428_142), /precedes/);
  assert.throws(() => validateExpiryHeight(profile, 3_428_200, 3_428_199), /earlier/);
  assert.throws(() => validateExpiryHeight(profile, 3_428_200, 500_000_000), /block-height range/);
});

test("uses strict ZIP 203 expiry and BIP 65 lock boundaries", () => {
  assert.deepEqual(evaluateExpiry(3_500_000), {
    state: "unresolved",
    reason: "Observed chain height was not supplied",
  });
  assert.equal(evaluateExpiry(3_500_000, 3_500_000).state, "eligible");
  assert.equal(evaluateExpiry(3_500_000, 3_500_001).state, "expired");
  assert.equal(evaluateExpiry(0, 9).state, "disabled");

  const heightLock = validateAbsoluteLock({ type: "height", value: 3_600_000 });
  assert.equal(evaluateAbsoluteLock(heightLock, {}).state, "unresolved");
  assert.equal(evaluateAbsoluteLock(heightLock, { height: 3_600_000 }).state, "early");
  assert.equal(evaluateAbsoluteLock(heightLock, { height: 3_600_001 }).state, "satisfied");

  const timeLock = validateAbsoluteLock({ type: "timestamp", value: 1_800_000_000 });
  assert.equal(evaluateAbsoluteLock(timeLock, { medianTimePast: 1_800_000_000 }).state, "early");
  assert.equal(evaluateAbsoluteLock(timeLock, { medianTimePast: 1_800_000_001 }).state, "satisfied");
  assert.throws(() => validateAbsoluteLock({ type: "height", value: 500_000_000 }), /Height locktime/);
  assert.throws(() => validateAbsoluteLock({ type: "timestamp", value: 499_999_999 }), /Timestamp locktime/);
});

test("fixes sequences and leaves replacement policy unresolved by default", () => {
  assert.equal(sequenceForArtifact("fund"), FINAL_SEQUENCE);
  assert.equal(sequenceForArtifact("claim"), FINAL_SEQUENCE);
  assert.equal(sequenceForArtifact("refund"), LOCKTIME_ENABLED_SEQUENCE);
  assert.doesNotThrow(() => assertArtifactSequence("refund", LOCKTIME_ENABLED_SEQUENCE));
  assert.throws(() => assertArtifactSequence("refund", FINAL_SEQUENCE), /fixed artifact policy/);
  assert.equal(replacementAssessment().state, "unresolved");
  assert.equal(replacementAssessment("zallet-v-next-explicit").state, "policy-supplied");
});
