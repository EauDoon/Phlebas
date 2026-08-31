import assert from "node:assert/strict";
import test from "node:test";

import {
  UINT64_MAX,
  accountIdentifier,
  adapterIdentifier,
  assertUint,
  assetIdentifier,
  chainIdentifier,
  normalizeAddress,
  normalizeHex32,
} from "./order-domain.ts";

test("derives stable, namespace-separated chain, asset, account, and adapter identifiers", () => {
  const chain = chainIdentifier("eip155:42161");
  const asset = assetIdentifier("eip155:42161/erc20:0x2222222222222222222222222222222222222222");
  const account = accountIdentifier("session:maker-1");
  const adapter = adapterIdentifier("no-value-reference-v1");
  for (const identifier of [chain, asset, account, adapter]) assert.match(identifier, /^0x[0-9a-f]{64}$/);
  assert.equal(chain, chainIdentifier("eip155:42161"));
  assert.equal(new Set([chain, asset, account, adapter]).size, 4);
});

test("accepts native Zcash identifiers without treating them as EVM assets", () => {
  const zcash = chainIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d");
  const nativeZec = assetIdentifier("bip122:00040fe8ec8471911baa1db1266ea15d/slip44:133");
  assert.notEqual(zcash, nativeZec);
});

test("normalizes exact fixed-width hexadecimal values", () => {
  assert.equal(normalizeAddress(`0x${"AB".repeat(20)}`, "Maker"), `0x${"ab".repeat(20)}`);
  assert.equal(normalizeHex32(`0x${"CD".repeat(32)}`, "Salt"), `0x${"cd".repeat(32)}`);
  assert.throws(() => normalizeAddress("0x1234", "Maker"), /20 bytes/);
  assert.throws(() => normalizeHex32("0x1234", "Salt"), /32 bytes/);
});

test("enforces exact unsigned integer ranges", () => {
  assert.doesNotThrow(() => assertUint(UINT64_MAX, 64, "Nonce"));
  assert.throws(() => assertUint(UINT64_MAX + 1n, 64, "Nonce"), /uint64/);
  assert.throws(() => assertUint(-1n, 256, "Amount"), /uint256/);
});

test("rejects ambiguous or malformed canonical identifiers", () => {
  assert.throws(() => chainIdentifier("42161"), /CAIP-2/);
  assert.throws(() => chainIdentifier(`bip122:${"a".repeat(33)}`), /CAIP-2/);
  assert.throws(() => assetIdentifier("eip155:42161"), /CAIP-19/);
  assert.throws(() => assetIdentifier("eip155:42161/erc20:not_allowed"), /CAIP-19/);
  assert.throws(() => accountIdentifier(" account"), /canonical string/);
  assert.throws(() => adapterIdentifier("Native ZEC"), /invalid/);
});
