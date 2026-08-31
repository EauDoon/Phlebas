import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { bytesToHex, hexToBytes } from "./keccak.ts";
import {
  buildHtlcRedeemScript,
  claimWitnessTemplate,
  CLTV_LOCKTIME_THRESHOLD,
  decodeMinimalScriptNumber,
  encodeMinimalScriptNumber,
  evaluateHtlcCltv,
  htlcP2shAddress,
  htlcP2shScriptPubKey,
  htlcTemplatePolicyReport,
  isHtlcP2shScriptPubKey,
  isHtlcRedeemScript,
  parseHtlcRedeemScript,
  refundWitnessTemplate,
  type HtlcParameters,
} from "./zcash-htlc.ts";
import { decodeTransparentAddress, hash160 } from "./zcash-transparent.ts";

const ZERO_PREIMAGE = new Uint8Array(32);
const ZERO_PREIMAGE_DIGEST = Uint8Array.from(createHash("sha256").update(ZERO_PREIMAGE).digest());
const CLAIM_PKH = hexToBytes("00112233445566778899aabbccddeeff00112233");
const REFUND_PKH = hexToBytes("ffeeddccbbaa99887766554433221100fedcba98");

const PARAMETERS: HtlcParameters = {
  digest: ZERO_PREIMAGE_DIGEST,
  claimPkh: CLAIM_PKH,
  refundPkh: REFUND_PKH,
  lock: { type: "height", value: 2_000_000 },
};

const EXPECTED_SCRIPT =
  "6382012088a82066687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f29258876a91400112233445566778899aabbccddeeff00112233670380841eb17576a914ffeeddccbbaa99887766554433221100fedcba986888ac";

test("frozen zero-preimage vector builds and parses the exact template", () => {
  assert.equal(bytesToHex(ZERO_PREIMAGE_DIGEST), "66687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f2925");
  const script = buildHtlcRedeemScript(PARAMETERS);
  assert.equal(bytesToHex(script), EXPECTED_SCRIPT);
  assert.equal(script.length, 96);

  const parsed = parseHtlcRedeemScript(script);
  assert.equal(bytesToHex(parsed.digest), bytesToHex(PARAMETERS.digest));
  assert.equal(bytesToHex(parsed.claimPkh), bytesToHex(PARAMETERS.claimPkh));
  assert.equal(bytesToHex(parsed.refundPkh), bytesToHex(PARAMETERS.refundPkh));
  assert.deepEqual(parsed.lock, PARAMETERS.lock);
});

test("P2SH output and address use the existing byte-order-safe transparent codecs", () => {
  const script = buildHtlcRedeemScript(PARAMETERS);
  const scriptPubKey = htlcP2shScriptPubKey(script);
  const address = htlcP2shAddress(script, "testnet");

  assert.equal(bytesToHex(hash160(script)), "983b2e116805e826f812241e9160b2bf43ff519b");
  assert.equal(bytesToHex(scriptPubKey), "a914983b2e116805e826f812241e9160b2bf43ff519b87");
  assert.equal(address, "t2LRjac7XRYh3aMbixigsm2QqM2zYsMp1KW");
  const decoded = decodeTransparentAddress(address);
  assert.equal(decoded.network, "testnet");
  assert.equal(decoded.type, "p2sh");
  assert.equal(bytesToHex(decoded.hash), bytesToHex(hash160(script)));
  assert.equal(isHtlcP2shScriptPubKey(scriptPubKey, script), true);

  const wrongHash = Uint8Array.from(scriptPubKey);
  wrongHash[2] ^= 0x01;
  assert.equal(isHtlcP2shScriptPubKey(wrongHash, script), false);
});

test("the exact template report stays scoped below full transaction relay policy", () => {
  const report = htlcTemplatePolicyReport(buildHtlcRedeemScript(PARAMETERS));
  assert.equal(report.scope, "redeem-script-template-only");
  assert.equal(report.exactTemplate, true);
  assert.equal(report.templatePolicyPasses, true);
  assert.equal(report.relayability, "unresolved-requires-complete-transaction-and-node-policy");
  assert.equal(report.staticSigops, 1);
  assert.equal(report.scriptLength, 96);
  assert.equal(report.redeemScriptLength, 96);
  assert.equal(report.maxRedeemScriptLength, 520);
  assert.equal(report.withinP2shPushLimit, true);
  assert.deepEqual(report.reasons, []);
});

test("script numbers and pushes are signed-magnitude little-endian and minimal", () => {
  assert.equal(bytesToHex(encodeMinimalScriptNumber(2_000_000)), "80841e");
  assert.equal(bytesToHex(encodeMinimalScriptNumber(0x80)), "8000");
  assert.equal(decodeMinimalScriptNumber(hexToBytes("80841e")), 2_000_000);
  assert.equal(decodeMinimalScriptNumber(hexToBytes("8000")), 0x80);
  assert.throws(() => decodeMinimalScriptNumber(hexToBytes("00")), /minimally encoded/);
  assert.throws(() => decodeMinimalScriptNumber(hexToBytes("800000")), /minimally encoded/);

  const smallHeight = buildHtlcRedeemScript({ ...PARAMETERS, lock: { type: "height", value: 1 } });
  assert.equal(parseHtlcRedeemScript(smallHeight).lock.value, 1);
  assert.equal(smallHeight[64], 0x51);

  const nonMinimalLockPush = Uint8Array.from(buildHtlcRedeemScript(PARAMETERS));
  nonMinimalLockPush[64] = 0x4c;
  nonMinimalLockPush[65] = 0x03;
  assert.throws(() => parseHtlcRedeemScript(nonMinimalLockPush), /non-minimal OP_PUSHDATA1/);
});

test("lock type and uint32 boundaries are explicit", () => {
  const timestamp = buildHtlcRedeemScript({
    ...PARAMETERS,
    lock: { type: "timestamp", value: CLTV_LOCKTIME_THRESHOLD },
  });
  assert.deepEqual(parseHtlcRedeemScript(timestamp).lock, {
    type: "timestamp",
    value: CLTV_LOCKTIME_THRESHOLD,
  });

  assert.throws(() => buildHtlcRedeemScript({ ...PARAMETERS, lock: { type: "height", value: 0 } }), /between 1/);
  assert.throws(
    () => buildHtlcRedeemScript({ ...PARAMETERS, lock: { type: "height", value: CLTV_LOCKTIME_THRESHOLD } }),
    /between 1/,
  );
  assert.throws(
    () => buildHtlcRedeemScript({ ...PARAMETERS, lock: { type: "timestamp", value: CLTV_LOCKTIME_THRESHOLD - 1 } }),
    /between 500000000/,
  );
  assert.throws(
    () => buildHtlcRedeemScript({ ...PARAMETERS, lock: { type: "timestamp", value: 0x1_0000_0000 } }),
    /4294967295/,
  );
});

test("CLTV evaluation requires type match, nonfinal sequence, transaction lock, and strict maturity", () => {
  const earlyMaturity = evaluateHtlcCltv({
    lock: PARAMETERS.lock,
    txLockTime: PARAMETERS.lock.value,
    inputSequence: 0xffff_fffe,
    currentBlockHeight: PARAMETERS.lock.value,
  });
  assert.equal(earlyMaturity.passesCltv, true);
  assert.equal(earlyMaturity.currentStateMature, false);
  assert.equal(earlyMaturity.valid, false);
  assert.match(earlyMaturity.reason ?? "", /strictly greater/);

  const mature = evaluateHtlcCltv(PARAMETERS.lock, PARAMETERS.lock.value, 0xffff_fffe, {
    currentBlockHeight: PARAMETERS.lock.value + 1,
  });
  assert.equal(mature.valid, true);
  assert.equal(mature.eligible, true);

  const finalSequence = evaluateHtlcCltv({
    lock: PARAMETERS.lock,
    txLockTime: PARAMETERS.lock.value,
    inputSequence: 0xffff_ffff,
    currentBlockHeight: PARAMETERS.lock.value + 1,
  });
  assert.equal(finalSequence.inputSequenceNonFinal, false);
  assert.equal(finalSequence.valid, false);
  assert.match(finalSequence.reason ?? "", /final/);

  const earlierTransactionLock = evaluateHtlcCltv({
    lock: PARAMETERS.lock,
    txLockTime: PARAMETERS.lock.value - 1,
    inputSequence: 0xffff_fffe,
    currentBlockHeight: PARAMETERS.lock.value + 1,
  });
  assert.equal(earlierTransactionLock.transactionLockAtLeastOperand, false);
  assert.equal(earlierTransactionLock.valid, false);

  const wrongType = evaluateHtlcCltv({
    lock: PARAMETERS.lock,
    txLockTime: CLTV_LOCKTIME_THRESHOLD,
    inputSequence: 0xffff_fffe,
    currentBlockHeight: PARAMETERS.lock.value + 1,
  });
  assert.equal(wrongType.lockTypeMatches, false);
  assert.equal(wrongType.valid, false);
});

test("timestamp maturity uses strict block time and no implicit default", () => {
  const lock = { type: "timestamp", value: CLTV_LOCKTIME_THRESHOLD } as const;
  const noContext = evaluateHtlcCltv({ lock, txLockTime: lock.value, inputSequence: 0xffff_fffe });
  assert.equal(noContext.valid, false);
  assert.equal(noContext.currentStateMature, false);

  const atTime = evaluateHtlcCltv({
    lock,
    txLockTime: lock.value,
    inputSequence: 0xffff_fffe,
    currentBlockTime: lock.value,
  });
  assert.equal(atTime.valid, false);

  const afterTime = evaluateHtlcCltv({
    lock,
    txLockTime: lock.value,
    inputSequence: 0xffff_fffe,
    currentTime: lock.value + 1,
  });
  assert.equal(afterTime.valid, true);
});

test("wrong digest or recipient fails expected-template validation", () => {
  const script = buildHtlcRedeemScript(PARAMETERS);
  const wrongDigest = Uint8Array.from(script);
  wrongDigest[7] ^= 0x01;
  assert.equal(isHtlcRedeemScript(wrongDigest), true);
  assert.equal(isHtlcRedeemScript(wrongDigest, PARAMETERS), false);

  const wrongClaimRecipient = Uint8Array.from(script);
  wrongClaimRecipient[43] ^= 0x01;
  assert.equal(isHtlcRedeemScript(wrongClaimRecipient), true);
  assert.equal(isHtlcRedeemScript(wrongClaimRecipient, PARAMETERS), false);

  const malformed = Uint8Array.from(script.slice(0, -1));
  assert.equal(isHtlcRedeemScript(malformed), false);
});

test("claim and refund witness templates contain placeholders only", () => {
  assert.deepEqual(claimWitnessTemplate(), ["<signature>", "<publicKey>", "<preimage:32-bytes>", "OP_1"]);
  assert.deepEqual(refundWitnessTemplate(), ["<signature>", "<publicKey>", "OP_0"]);
  assert.equal(claimWitnessTemplate().some((item) => /^[0-9a-f]+$/i.test(item)), false);
  assert.equal(refundWitnessTemplate().some((item) => /^[0-9a-f]+$/i.test(item)), false);
});
