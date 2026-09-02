import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildAtomicSwapScript, parseAtomicSwapScript } from "./zcash-atomic-swap.ts";
import { parseCompressedPubkey } from "./zcash-pubkey.ts";
import { scriptAddress } from "./zcash-script-address.ts";
import { legacyAtomicSwapScriptHex } from "./zcash-wallet-adapter.ts";

// Explicit atomic-swap test vectors. The script hash is the source of
// truth for the matcher, the wallet adapter, and the offchain
// coordinator. Any change to the script layout must update these
// vectors.
//
// The vectors pin literal bytes and the literal P2SH address they hash
// to. An earlier version of this file compared legacyAtomicSwapScriptHex
// against a local hex encoder applied to the same script, and called the
// builder twice and compared the two results, so no change to the script
// layout could break it. A sign-pad defect that multiplied half of all
// lock times by 256 lived underneath these vectors without failing one.

function makePubkey(seed: number): Uint8Array {
  const out = new Uint8Array(33);
  out[0] = 0x02;
  for (let i = 1; i < 33; i++) out[i] = ((seed * 31 + i * 7) & 0xff) || 1;
  return out;
}

function hex(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, "0");
  return out;
}

test("vector 1: simple script with 20-byte zero hash and round lock time", () => {
  const hash20 = new Uint8Array(20);
  const buyer = parseCompressedPubkey(makePubkey(11));
  const seller = parseCompressedPubkey(makePubkey(22));
  const lock = 1_900_000_000n;
  const params = { hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime: lock };
  const script = buildAtomicSwapScript(params);
  assert.equal(
    hex(script),
    "63a9140000000000000000000000000000000000000000882102"
    + "5c636a71787f868d949ba2a9b0b7bec5ccd3dae1e8eff6fd040b121920272e35"
    + "ac670400b33f71b1752102"
    + "b1b8bfc6cdd4dbe2e9f0f7fe050c131a21282f363d444b525960676e757c838a"
    + "ac68",
  );
  // 0x713fb300 read little-endian is 1_900_000_000, and the push is four
  // bytes because the most significant byte 0x71 has bit 7 clear.
  assert.ok(hex(script).includes("ac670400b33f71b175"));
  assert.equal(legacyAtomicSwapScriptHex(params), `0x${hex(script)}`);
  assert.equal(scriptAddress(script, "mainnet"), "t3KiUJyPLGdPdzTncGkzkdUqfeSASPowq62");
  assert.equal(scriptAddress(script, "testnet"), "t27hfMeVU9611YANMCVzoB72JkvPcFQJGFw");
});

test("vector 2: parity-3 seller pubkey produces a different script hash", () => {
  const hash20 = new Uint8Array(20);
  for (let i = 0; i < 20; i++) hash20[i] = (i * 7 + 3) & 0xff;
  const buyer = parseCompressedPubkey(makePubkey(33));
  const sellerPub = new Uint8Array(33);
  sellerPub[0] = 0x03;
  for (let i = 1; i < 33; i++) sellerPub[i] = ((33 * 31 + i * 7) & 0xff) || 1;
  const seller = parseCompressedPubkey(sellerPub);
  const script = buildAtomicSwapScript({ hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime: 1_700_000_000n });
  // Different seller parity changes the script bytes.
  assert.notEqual(script[0], 0);
  const parsed = parseAtomicSwapScript(script);
  assert.equal(parsed.buyerPubkey.parity, 0x02);
  assert.equal(parsed.sellerPubkey.parity, 0x03);
});

test("vector 3: lock time zero is serialized as the single byte OP_0 in the refund branch", () => {
  const hash20 = new Uint8Array(20);
  for (let i = 0; i < 20; i++) hash20[i] = (i * 11) & 0xff;
  const buyer = parseCompressedPubkey(makePubkey(44));
  const seller = parseCompressedPubkey(makePubkey(55));
  // The builder accepts lock time 0; the offchain matcher enforces the
  // EVM-vs-ZEC deadline relationship. Zero is the empty push, OP_0.
  const script = buildAtomicSwapScript({ hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime: 0n });
  assert.equal(
    hex(script),
    "63a914000b16212c37424d58636e79848f9aa5b0bbc6d1882102"
    + "5b626970777e858c939aa1a8afb6bdc4cbd2d9e0e7eef5fc030a11181f262d34"
    + "ac6700b175" + "2102"
    + "b0b7bec5ccd3dae1e8eff6fd040b121920272e353c434a51585f666d747b8289"
    + "ac68",
  );
  // OP_ELSE, OP_0, OP_CHECKLOCKTIMEVERIFY, OP_DROP with nothing between.
  assert.ok(hex(script).includes("ac6700b175"));
  assert.equal(scriptAddress(script, "mainnet"), "t3XYLA23BHhoSJzD8HTnjPz83qQmhfhLtFg");
  assert.equal(scriptAddress(script, "testnet"), "t2KXXCh9KAAQorgnsDCnmwcJgwtzsUJRrWr");
});

test("vector 4: a lock time whose low byte has the high bit set is not shifted", () => {
  // 1_767_225_728 is 0x69 55 b9 80: the low byte 0x80 has bit 7 set. The
  // pad belongs after the most significant byte, not before the least
  // significant one, so the push is four bytes and not five, and the
  // operand is the lock time rather than 256 times it.
  const hash20 = new Uint8Array(20);
  for (let i = 0; i < 20; i++) hash20[i] = (i * 17) & 0xff;
  const buyer = parseCompressedPubkey(makePubkey(66));
  const seller = parseCompressedPubkey(makePubkey(77));
  const script = buildAtomicSwapScript({ hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime: 1_767_225_728n });
  assert.ok(hex(script).includes("ac670480b95569b175"), hex(script));
  assert.equal(parseAtomicSwapScript(script).lockTime, 1_767_225_728n);
});

test("vector 5: every script the builder emits parses back to its own inputs", () => {
  const buyer = parseCompressedPubkey(makePubkey(88));
  const seller = parseCompressedPubkey(makePubkey(99));
  const hash20 = new Uint8Array(20);
  for (let i = 0; i < 20; i++) hash20[i] = (i * 23 + 5) & 0xff;
  const locks = [0n, 1n, 127n, 128n, 255n, 256n, 32_768n, 8_388_608n, 12_896_896n,
    499_999_999n, 500_000_000n, 500_000_128n, 1_767_225_728n, 2_147_483_648n, 4_294_967_295n];
  for (const lockTime of locks) {
    const script = buildAtomicSwapScript({ hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime });
    const parsed = parseAtomicSwapScript(script);
    assert.equal(parsed.lockTime, lockTime, `lock time ${lockTime} did not round-trip`);
    assert.equal(hex(parsed.hash20), hex(hash20));
    assert.equal(parsed.buyerPubkey.parity, 0x02);
    assert.equal(parsed.sellerPubkey.parity, 0x02);
  }
});
