import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  buildAtomicSwapScript,
  buildClaimBranch,
  buildRefundBranch,
  parseAtomicSwapScript,
} from "./zcash-atomic-swap.ts";
import { parseCompressedPubkey } from "./zcash-pubkey.ts";

function makePubkey(seed: number): Uint8Array {
  const out = new Uint8Array(33);
  out[0] = 0x02;
  for (let i = 1; i < 33; i++) out[i] = ((seed + i * 7) & 0xff) || 1;
  return out;
}

test("buildClaimBranch starts with OP_HASH160 and ends with OP_CHECKSIG", () => {
  const hash20 = new Uint8Array(20);
  for (let i = 0; i < 20; i++) hash20[i] = (i * 11 + 1) & 0xff;
  const branch = buildClaimBranch(hash20, makePubkey(1));
  assert.equal(branch[0], 0xa9);
  assert.equal(branch[branch.length - 1], 0xac);
});

test("buildClaimBranch rejects a wrong-length hash", () => {
  assert.throws(() => buildClaimBranch(new Uint8Array(19), makePubkey(1)), /20 bytes/);
  assert.throws(() => buildClaimBranch(new Uint8Array(21), makePubkey(1)), /20 bytes/);
});

test("buildClaimBranch rejects a wrong-length pubkey", () => {
  assert.throws(() => buildClaimBranch(new Uint8Array(20), new Uint8Array(32)), /33 bytes/);
});

test("buildRefundBranch embeds the lock time and ends with OP_CHECKSIG", () => {
  const branch = buildRefundBranch(1_700_000_000n, makePubkey(1));
  assert.equal(branch[branch.length - 1], 0xac);
  // Search for OP_DROP (0x75) preceded by OP_CHECKLOCKTIMEVERIFY (0xb1) — the
  // two bytes that mark the boundary between the lock-time push and the
  // pubkey push.
  let dropIdx = -1;
  for (let i = 0; i < branch.length; i++) {
    if (branch[i] === 0x75 && i > 0 && branch[i - 1] === 0xb1) {
      dropIdx = i;
      break;
    }
  }
  assert.notEqual(dropIdx, -1, "OP_DROP after OP_CHECKLOCKTIMEVERIFY not found");
});

test("buildRefundBranch rejects a lock time out of uint32 range", () => {
  assert.throws(() => buildRefundBranch(-1n, makePubkey(1)), /uint32/);
  assert.throws(() => buildRefundBranch(0x100000000n, makePubkey(1)), /uint32/);
});

test("buildAtomicSwapScript produces a script that round-trips through parseAtomicSwapScript", () => {
  const hash20 = new Uint8Array(20);
  for (let i = 0; i < 20; i++) hash20[i] = (i * 13 + 7) & 0xff;
  const script = buildAtomicSwapScript({
    hash20,
    buyerPubkey: parseCompressedPubkey(makePubkey(1)),
    sellerPubkey: parseCompressedPubkey(makePubkey(2)),
    lockTime: 1_900_000_000n,
  });
  const parsed = parseAtomicSwapScript(script);
  for (let i = 0; i < 20; i++) assert.equal(parsed.hash20[i], hash20[i]);
  assert.equal(parsed.buyerPubkey.parity, 0x02);
  assert.equal(parsed.sellerPubkey.parity, 0x02);
  assert.equal(parsed.lockTime, 1_900_000_000n);
});

test("buildAtomicSwapScript rejects a wrong-length hash", () => {
  assert.throws(
    () =>
      buildAtomicSwapScript({
        hash20: new Uint8Array(19),
        buyerPubkey: parseCompressedPubkey(makePubkey(1)),
        sellerPubkey: parseCompressedPubkey(makePubkey(2)),
        lockTime: 1n,
      }),
    /20 bytes/,
  );
});

test("buildAtomicSwapScript rejects identical buyer and seller pubkeys", () => {
  const same = makePubkey(7);
  assert.throws(
    () =>
      buildAtomicSwapScript({
        hash20: new Uint8Array(20),
        buyerPubkey: parseCompressedPubkey(same),
        sellerPubkey: parseCompressedPubkey(same),
        lockTime: 1n,
      }),
    /must differ/,
  );
});
