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

test("extractLockTime rejects OP_1NEGATE instead of reporting it as lock time zero", () => {
  // 0x4f is OP_1NEGATE, a push of -1. BIP 65 fails a negative operand,
  // so a script carrying it has no working refund branch; reporting it
  // as 0 said the opposite, that the refund was already claimable.
  const buyer = parseCompressedPubkey(makePubkey(1));
  const seller = parseCompressedPubkey(makePubkey(2));
  const good = buildAtomicSwapScript({ hash20: new Uint8Array(20), buyerPubkey: buyer, sellerPubkey: seller, lockTime: 0n });
  const forged = Uint8Array.from(good);
  const elseIndex = forged.indexOf(0x67);
  forged[elseIndex + 1] = 0x4f;
  assert.throws(() => parseAtomicSwapScript(forged), /unexpected length/);
});

test("extractLockTime requires OP_CHECKLOCKTIMEVERIFY and OP_DROP after the push", () => {
  const buyer = parseCompressedPubkey(makePubkey(3));
  const seller = parseCompressedPubkey(makePubkey(4));
  const good = buildAtomicSwapScript({ hash20: new Uint8Array(20), buyerPubkey: buyer, sellerPubkey: seller, lockTime: 1_700_000_000n });
  const elseIndex = good.indexOf(0x67);

  const noCltv = Uint8Array.from(good);
  noCltv[elseIndex + 6] = 0x00; // where OP_CHECKLOCKTIMEVERIFY sits
  assert.throws(() => parseAtomicSwapScript(noCltv), /OP_CHECKLOCKTIMEVERIFY/);

  const noDrop = Uint8Array.from(good);
  noDrop[elseIndex + 7] = 0x00; // where OP_DROP sits
  assert.throws(() => parseAtomicSwapScript(noDrop), /OP_DROP/);
});

test("extractLockTime reads back a lock time that needs the five-byte sign pad", () => {
  // 0x80000000 and above need four magnitude bytes plus the pad. A parser
  // capped at four bytes could not read half the uint32 domain.
  const buyer = parseCompressedPubkey(makePubkey(5));
  const seller = parseCompressedPubkey(makePubkey(6));
  for (const lockTime of [2_147_483_648n, 3_000_000_000n, 4_294_967_295n]) {
    const script = buildAtomicSwapScript({ hash20: new Uint8Array(20), buyerPubkey: buyer, sellerPubkey: seller, lockTime });
    assert.equal(parseAtomicSwapScript(script).lockTime, lockTime);
  }
});

test("extractLockTime rejects a non-minimal push and a negative operand", () => {
  const buyer = parseCompressedPubkey(makePubkey(7));
  const seller = parseCompressedPubkey(makePubkey(8));
  const tail = [0xb1, 0x75, 33, 0x02, ...new Array(32).fill(0x11), 0xac, 0x68];
  const claim = [0x63, 0xa9, 20, ...new Array(20).fill(0), 0x88, 33, 0x02, ...new Array(32).fill(0x22), 0xac, 0x67];
  // 0x01 0x00 pushes a redundant zero byte: minimally, zero is OP_0.
  assert.throws(() => parseAtomicSwapScript(Uint8Array.from([...claim, 0x01, 0x00, ...tail])), /minimally encoded/);
  // 0x02 0x01 0x00 is the value 1 carrying a pad it does not need,
  // because its most significant byte 0x01 already has bit 7 clear.
  assert.throws(() => parseAtomicSwapScript(Uint8Array.from([...claim, 0x02, 0x01, 0x00, ...tail])), /minimally encoded/);
  // 0x01 0x80 is CScriptNum negative zero.
  assert.throws(() => parseAtomicSwapScript(Uint8Array.from([...claim, 0x01, 0x80, ...tail])), /must not be negative/);
  // The pad that IS needed stays legal: 0x02 0x80 0x00 is 128, and
  // 0x02 0x00 0x01 is 256 little-endian, which is already minimal.
  assert.equal(parseAtomicSwapScript(Uint8Array.from([...claim, 0x02, 0x80, 0x00, ...tail])).lockTime, 128n);
  assert.equal(parseAtomicSwapScript(Uint8Array.from([...claim, 0x02, 0x00, 0x01, ...tail])).lockTime, 256n);
  assert.equal(parseCompressedPubkey(makePubkey(7)).parity, buyer.parity);
  assert.equal(seller.parity, 0x02);
});

test("the branch split skips pushed data so a 0x67 byte in a payload cannot split the script", () => {
  // OP_ELSE is 0x67. Scanning raw bytes for it split the script in the
  // middle of the hash push whenever the hash happened to contain 0x67.
  const hash20 = new Uint8Array(20).fill(0x67);
  const buyer = parseCompressedPubkey(makePubkey(9));
  const seller = parseCompressedPubkey(makePubkey(10));
  const script = buildAtomicSwapScript({ hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime: 1_600_000_000n });
  const parsed = parseAtomicSwapScript(script);
  assert.deepEqual([...parsed.hash20], [...hash20]);
  assert.equal(parsed.lockTime, 1_600_000_000n);
});

test("the parsed hash20 does not alias the script buffer", () => {
  const buyer = parseCompressedPubkey(makePubkey(12));
  const seller = parseCompressedPubkey(makePubkey(13));
  const hash20 = new Uint8Array(20).fill(0xcd);
  const script = buildAtomicSwapScript({ hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime: 1_500_000_000n });
  const parsed = parseAtomicSwapScript(script);
  script[3] = 0x01;
  assert.equal(parsed.hash20[1], 0xcd);
});
