import { createHash } from "node:crypto";
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { bytesToHex, hexToBytes } from "./keccak.ts";
import { buildHtlcRedeemScript, htlcP2shAddress } from "./zcash-htlc.ts";
import {
  pollZcashOnce,
  type ZcashEventSource,
  type ZcashSpendEvidence,
  type ZcashTransparentInputEvidence,
} from "./zcash-observer.ts";
import { hash160 } from "./zcash-transparent.ts";

const FUNDING_TXID = "ab".repeat(32);
const SPEND_TXID = "cd".repeat(32);
const CLAIM_PUBLIC_KEY = hexToBytes(`02${"79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"}`);
const REFUND_PUBLIC_KEY = hexToBytes(`03${"79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798"}`);
const PREIMAGE = new Uint8Array(32);
const SIGNATURE = Uint8Array.of(0x30, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x01, 0x01);
const REDEEM_SCRIPT = buildHtlcRedeemScript({
  digest: createHash("sha256").update(PREIMAGE).digest(),
  claimPkh: hash160(CLAIM_PUBLIC_KEY),
  refundPkh: hash160(REFUND_PUBLIC_KEY),
  lock: { type: "height", value: 150 },
});
const REDEEM_SCRIPT_HEX = bytesToHex(REDEEM_SCRIPT);
const TESTNET_ADDRESS = htlcP2shAddress(REDEEM_SCRIPT, "testnet");

function canonicalPush(data: Uint8Array): Uint8Array {
  if (data.length === 0) return Uint8Array.of(0x00);
  if (data.length === 1 && data[0] >= 1 && data[0] <= 16) return Uint8Array.of(0x50 + data[0]);
  if (data.length <= 75) return Uint8Array.of(data.length, ...data);
  if (data.length <= 0xff) return Uint8Array.of(0x4c, data.length, ...data);
  return Uint8Array.of(0x4d, data.length & 0xff, data.length >>> 8, ...data);
}

function scriptSig(pushes: readonly Uint8Array[]): string {
  return bytesToHex(Uint8Array.from(pushes.flatMap((push) => [...canonicalPush(push)])));
}

function claimInput(overrides: Partial<ZcashTransparentInputEvidence> = {}): ZcashTransparentInputEvidence {
  return {
    prevTxid: FUNDING_TXID,
    prevVout: 0,
    scriptSigHex: scriptSig([SIGNATURE, CLAIM_PUBLIC_KEY, PREIMAGE, Uint8Array.of(1), REDEEM_SCRIPT]),
    sequence: 0xffff_ffff,
    ...overrides,
  };
}

function refundInput(overrides: Partial<ZcashTransparentInputEvidence> = {}): ZcashTransparentInputEvidence {
  return {
    prevTxid: FUNDING_TXID,
    prevVout: 0,
    scriptSigHex: scriptSig([SIGNATURE, REFUND_PUBLIC_KEY, new Uint8Array(), REDEEM_SCRIPT]),
    sequence: 0xffff_fffe,
    ...overrides,
  };
}

function spentEvidence(
  input: ZcashTransparentInputEvidence,
  lockTime = 0,
  extraInputs: readonly ZcashTransparentInputEvidence[] = [],
): ZcashSpendEvidence {
  return {
    spent: true,
    spendTxid: SPEND_TXID,
    lockTime,
    transparentInputs: [input, ...extraInputs],
  };
}

function makeSource(
  spent: ZcashSpendEvidence,
  blockHeight = 100n,
  address = TESTNET_ADDRESS,
): ZcashEventSource {
  return {
    fetchAddressOutpoints: async (requestedAddress) => requestedAddress === address
      ? [{ txid: FUNDING_TXID, vout: 0, amountZatoshis: 100_000n, blockHeight }]
      : [],
    fetchSpend: async () => spent,
  };
}

function poll(
  spend: ZcashSpendEvidence,
  options: Readonly<{
    blockHeight?: bigint;
    fromHeight?: bigint;
    address?: string;
    expectedRedeemScriptHex?: string;
  }> = {},
) {
  const address = options.address ?? TESTNET_ADDRESS;
  return pollZcashOnce({
    addresses: [address],
    fromHeight: options.fromHeight ?? 0n,
    source: makeSource(spend, options.blockHeight, address),
    expectedRedeemScriptByOutpoint: options.expectedRedeemScriptHex === undefined
      ? { [`${FUNDING_TXID}:0`]: REDEEM_SCRIPT_HEX }
      : { [`${FUNDING_TXID}:0`]: options.expectedRedeemScriptHex },
  });
}

test("pollZcashOnce emits a funded event for an explicitly unspent outpoint", async () => {
  const events = await poll({ spent: false, spendTxid: null });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "funded");
  assert.equal(events[0].amountZatoshis, 100_000n);
});

test("pollZcashOnce classifies a claim from its exact input witness, not funding height", async () => {
  const events = await poll(spentEvidence(claimInput()), { blockHeight: 100n, fromHeight: 200n });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "claimed");
});

test("pollZcashOnce classifies a refund from its exact branch and CLTV evidence, not funding height", async () => {
  const events = await poll(spentEvidence(refundInput(), 150), { blockHeight: 200n, fromHeight: 195n });
  assert.equal(events.length, 1);
  assert.equal(events[0].kind, "refunded");
});

test("pollZcashOnce aggregates explicitly unspent outpoints across addresses", async () => {
  const source: ZcashEventSource = {
    fetchAddressOutpoints: async (address) => {
      if (address === "t2abc") return [{ txid: FUNDING_TXID, vout: 0, amountZatoshis: 1n, blockHeight: 100n }];
      if (address === "t2def") return [{ txid: "ef".repeat(32), vout: 0, amountZatoshis: 2n, blockHeight: 200n }];
      return [];
    },
    fetchSpend: async () => ({ spent: false, spendTxid: null }),
  };
  const events = await pollZcashOnce({ addresses: ["t2abc", "t2def"], fromHeight: 0n, source });
  assert.equal(events.length, 2);
});

test("pollZcashOnce fails closed when a spent outpoint has no expected redeem script", async () => {
  const source = makeSource(spentEvidence(claimInput()));
  await assert.rejects(
    pollZcashOnce({ addresses: [TESTNET_ADDRESS], fromHeight: 0n, source }),
    /no expected redeemScript is configured/,
  );
});

test("pollZcashOnce rejects spend evidence that does not contain the expected outpoint", async () => {
  await assert.rejects(
    poll(spentEvidence(claimInput({ prevTxid: "ef".repeat(32) }))),
    /expected exactly one matching transparent input, got 0/,
  );
});

test("pollZcashOnce rejects ambiguous duplicate inputs for the expected outpoint", async () => {
  const input = claimInput();
  await assert.rejects(
    poll(spentEvidence(input, 0, [input])),
    /expected exactly one matching transparent input, got 2/,
  );
});

test("pollZcashOnce rejects a witness that reveals a substituted redeem script", async () => {
  const substituted = Uint8Array.from(REDEEM_SCRIPT);
  substituted[10] ^= 0x01;
  const input = claimInput({
    scriptSigHex: scriptSig([SIGNATURE, CLAIM_PUBLIC_KEY, PREIMAGE, Uint8Array.of(1), substituted]),
  });
  await assert.rejects(poll(spentEvidence(input)), /does not reveal the exact expected redeemScript/);
});

test("pollZcashOnce rejects a claim preimage that does not satisfy the hashlock", async () => {
  const wrongPreimage = Uint8Array.from(PREIMAGE);
  wrongPreimage[0] = 1;
  const input = claimInput({
    scriptSigHex: scriptSig([SIGNATURE, CLAIM_PUBLIC_KEY, wrongPreimage, Uint8Array.of(1), REDEEM_SCRIPT]),
  });
  await assert.rejects(poll(spentEvidence(input)), /does not satisfy the HTLC hashlock/);
});

test("pollZcashOnce rejects a public key from the wrong HTLC branch", async () => {
  const input = claimInput({
    scriptSigHex: scriptSig([SIGNATURE, REFUND_PUBLIC_KEY, PREIMAGE, Uint8Array.of(1), REDEEM_SCRIPT]),
  });
  await assert.rejects(poll(spentEvidence(input)), /does not match the selected HTLC branch/);
});

test("pollZcashOnce rejects a non-canonical branch-selector push", async () => {
  const canonical = hexToBytes(claimInput().scriptSigHex);
  const selectorOffset = canonical.length - canonicalPush(REDEEM_SCRIPT).length - 1;
  const nonCanonical = Uint8Array.from([
    ...canonical.slice(0, selectorOffset),
    0x01,
    0x01,
    ...canonical.slice(selectorOffset + 1),
  ]);
  const input = claimInput({ scriptSigHex: bytesToHex(nonCanonical) });
  await assert.rejects(poll(spentEvidence(input)), /non-minimal data push/);
});

test("pollZcashOnce rejects an oversized scriptSig before parsing pushes", async () => {
  const input = claimInput({ scriptSigHex: "00".repeat(1_651) });
  await assert.rejects(poll(spentEvidence(input)), /scriptSig exceeds 1650 bytes/);
});

test("pollZcashOnce rejects a refund with a final input sequence", async () => {
  await assert.rejects(
    poll(spentEvidence(refundInput({ sequence: 0xffff_ffff }), 150)),
    /input sequence is final/,
  );
});

test("pollZcashOnce rejects a refund transaction whose locktime is too early", async () => {
  await assert.rejects(
    poll(spentEvidence(refundInput(), 149)),
    /transaction locktime is earlier than the CLTV operand/,
  );
});

test("pollZcashOnce rejects a mainnet address even when it hashes the expected script", async () => {
  await assert.rejects(
    poll(spentEvidence(claimInput()), { address: htlcP2shAddress(REDEEM_SCRIPT, "mainnet") }),
    /watched address is not the testnet P2SH address/,
  );
});

test("pollZcashOnce rejects a witness signature that does not commit SIGHASH_ALL", async () => {
  const wrongSighash = Uint8Array.from(SIGNATURE);
  wrongSighash[wrongSighash.length - 1] = 0x02;
  const input = claimInput({
    scriptSigHex: scriptSig([wrongSighash, CLAIM_PUBLIC_KEY, PREIMAGE, Uint8Array.of(1), REDEEM_SCRIPT]),
  });
  await assert.rejects(poll(spentEvidence(input)), /canonical DER with SIGHASH_ALL/);
});
