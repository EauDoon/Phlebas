import { strict as assert } from "node:assert";
import { test } from "node:test";

import { buildAtomicSwapScript, parseAtomicSwapScript } from "./zcash-atomic-swap.ts";
import { parseCompressedPubkey } from "./zcash-pubkey.ts";
import { scriptAddress } from "./zcash-script-address.ts";

function makePubkey(seed: number): Uint8Array {
  const out = new Uint8Array(33);
  out[0] = 0x02;
  for (let i = 1; i < 33; i++) out[i] = ((seed * 31 + i * 7) & 0xff) || 1;
  return out;
}

test("scriptAddress returns a t2-prefixed address on testnet for a known script", () => {
  const hash20 = new Uint8Array(20);
  for (let i = 0; i < 20; i++) hash20[i] = (i * 13 + 7) & 0xff;
  const buyer = parseCompressedPubkey(makePubkey(11));
  const seller = parseCompressedPubkey(makePubkey(22));
  const script = buildAtomicSwapScript({ hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime: 1_900_000_000n });
  const address = scriptAddress(script, "testnet");
  assert.ok(address.startsWith("t2"), `expected t2 prefix, got ${address}`);
});

test("scriptAddress returns a t3-prefixed address on mainnet", () => {
  const hash20 = new Uint8Array(20);
  for (let i = 0; i < 20; i++) hash20[i] = (i * 13 + 7) & 0xff;
  const buyer = parseCompressedPubkey(makePubkey(11));
  const seller = parseCompressedPubkey(makePubkey(22));
  const script = buildAtomicSwapScript({ hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime: 1_900_000_000n });
  const address = scriptAddress(script, "mainnet");
  assert.ok(address.startsWith("t3"), `expected t3 prefix, got ${address}`);
});

test("scriptAddress is deterministic for the same script bytes", () => {
  const hash20 = new Uint8Array(20);
  for (let i = 0; i < 20; i++) hash20[i] = (i * 13 + 7) & 0xff;
  const buyer = parseCompressedPubkey(makePubkey(11));
  const seller = parseCompressedPubkey(makePubkey(22));
  const script = buildAtomicSwapScript({ hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime: 1_900_000_000n });
  const a = scriptAddress(script, "testnet");
  const b = scriptAddress(script, "testnet");
  assert.equal(a, b);
});

test("scriptAddress is round-trip-safe through parseAtomicSwapScript", () => {
  const hash20 = new Uint8Array(20);
  for (let i = 0; i < 20; i++) hash20[i] = (i * 13 + 7) & 0xff;
  const buyer = parseCompressedPubkey(makePubkey(11));
  const seller = parseCompressedPubkey(makePubkey(22));
  const script = buildAtomicSwapScript({ hash20, buyerPubkey: buyer, sellerPubkey: seller, lockTime: 1_900_000_000n });
  // Re-parsing the script does not change its bytes, so the address is the same.
  const parsed = parseAtomicSwapScript(script);
  const rebuilt = buildAtomicSwapScript({
    hash20: parsed.hash20,
    buyerPubkey: parsed.buyerPubkey,
    sellerPubkey: parsed.sellerPubkey,
    lockTime: parsed.lockTime,
  });
  assert.equal(scriptAddress(script, "testnet"), scriptAddress(rebuilt, "testnet"));
});
