import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  buildClaimTransaction,
  buildFundTransaction,
  buildRefundTransaction,
  hashAtomicSwapParams,
} from "./zcash-wallet-adapter.ts";
import { parseCompressedPubkey } from "./zcash-pubkey.ts";

function makePubkey(seed: number): Uint8Array {
  const out = new Uint8Array(33);
  out[0] = 0x02;
  for (let i = 1; i < 33; i++) out[i] = ((seed + i * 7) & 0xff) || 1;
  return out;
}

const SAMPLE_PARAMS = {
  hash20: new Uint8Array(20).fill(0xaa),
  buyerPubkey: parseCompressedPubkey(makePubkey(1)),
  sellerPubkey: parseCompressedPubkey(makePubkey(2)),
  lockTime: 1_900_000_000n,
};

test("buildFundTransaction returns an unsigned tx with the fund and change outputs", () => {
  const tx = buildFundTransaction({
    fundOutput: { valueZat: 1_000_000n, scriptPubKey: new Uint8Array([0x76, 0xa9, 0x14]) },
    changeOutput: { valueZat: 50_000n, scriptPubKey: new Uint8Array([0x76, 0xa9, 0x14, 0x01]) },
    lockTime: 0,
  });
  assert.equal(tx.version, 4);
  assert.equal(tx.lockTime, 0);
  assert.equal(tx.inputs.length, 0);
  assert.equal(tx.outputs.length, 2);
  assert.equal(tx.outputs[0].valueZat, 1_000_000n);
});

test("buildClaimTransaction returns an unsigned tx with the preimage as the scriptSig", () => {
  const preimage = new Uint8Array(32).fill(0x42);
  const tx = buildClaimTransaction({
    utxo: { txid: "ab".repeat(32), vout: 0, valueZat: 1_000_000n, scriptPubKey: new Uint8Array(0) },
    preimage,
    recipientOutput: { valueZat: 900_000n, scriptPubKey: new Uint8Array([0x76, 0xa9, 0x14]) },
    changeOutput: { valueZat: 90_000n, scriptPubKey: new Uint8Array([0x76, 0xa9, 0x14, 0x02]) },
    sequence: 0xfffffffe,
  });
  assert.equal(tx.inputs.length, 1);
  assert.equal(tx.inputs[0].scriptSig.length, 32);
  for (let i = 0; i < 32; i++) assert.equal(tx.inputs[0].scriptSig[i], 0x42);
  assert.equal(tx.inputs[0].sequence, 0xfffffffe);
});

test("buildRefundTransaction returns an unsigned tx with an empty scriptSig", () => {
  const tx = buildRefundTransaction({
    utxo: { txid: "cd".repeat(32), vout: 1, valueZat: 1_000_000n, scriptPubKey: new Uint8Array(0) },
    recipientOutput: { valueZat: 990_000n, scriptPubKey: new Uint8Array([0x76, 0xa9, 0x14]) },
    changeOutput: { valueZat: 0n, scriptPubKey: new Uint8Array([0x76, 0xa9, 0x14, 0x03]) },
    sequence: 0xfffffffe,
  });
  assert.equal(tx.inputs[0].scriptSig.length, 0);
});

test("hashAtomicSwapParams returns a deterministic hex string", () => {
  const a = hashAtomicSwapParams(SAMPLE_PARAMS);
  const b = hashAtomicSwapParams(SAMPLE_PARAMS);
  assert.equal(a, b);
  assert.ok(a.startsWith("0x"));
});
