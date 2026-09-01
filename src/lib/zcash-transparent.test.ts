import assert from "node:assert/strict";
import test from "node:test";

import { bytesToHex, hexToBytes } from "./keccak.ts";
import {
  decodeTransparentAddress,
  encodeTransparentAddress,
  hash160,
  p2pkhScriptPubKey,
  p2shAddressFromRedeemScript,
  p2shScriptPubKey,
  parseP2shScriptPubKey,
  prevoutBytesToTxidHex,
  transparentScriptPubKey,
  txidHexToPrevoutBytes,
} from "./zcash-transparent.ts";

const HASH = hexToBytes("00112233445566778899aabbccddeeff00112233");

test("transparent Base58Check vectors bind exact Zcash prefixes", () => {
  const vectors = [
    ["mainnet", "p2sh", "t3JZyTLmEC6pzFEnj9AcvefR8Pjo5tMRFNo"],
    ["testnet", "p2sh", "t26ZAW1sN4ZSMnwNU4ucyCHbmWE2FiVHYee"],
    ["mainnet", "p2pkh", "t1HsxXoGneCWcA56J24xLE34CFDWNK6RCqD"],
    ["testnet", "p2pkh", "tm9ihrdmC2s27JKHjgoG55hiwrCbBpoM4ec"],
  ] as const;

  for (const [network, type, expected] of vectors) {
    assert.equal(encodeTransparentAddress(network, type, HASH), expected);
    const decoded = decodeTransparentAddress(expected);
    assert.equal(decoded.network, network);
    assert.equal(decoded.type, type);
    assert.equal(bytesToHex(decoded.hash), bytesToHex(HASH));
  }
});

test("P2SH scriptPubKey and address retain HASH160 byte order", () => {
  const redeemScript = hexToBytes("51");
  const scriptHash = hash160(redeemScript);
  const scriptPubKey = p2shScriptPubKey(scriptHash);
  assert.equal(bytesToHex(scriptHash), "da1745e9b549bd0bfa1a569971c77eba30cd5a4b");
  assert.equal(bytesToHex(scriptPubKey), `a914${bytesToHex(scriptHash)}87`);
  assert.equal(bytesToHex(parseP2shScriptPubKey(scriptPubKey)), bytesToHex(scriptHash));
  assert.equal(p2shAddressFromRedeemScript(redeemScript, "testnet"), "t2SRyAR26tXTnZHfpa3jPqeyYmxCbAZxUnh");
});

test("transparent output construction rejects wrong networks and script shapes", () => {
  const mainnet = encodeTransparentAddress("mainnet", "p2pkh", HASH);
  const testnet = encodeTransparentAddress("testnet", "p2sh", HASH);
  assert.equal(bytesToHex(transparentScriptPubKey(mainnet, "mainnet")), bytesToHex(p2pkhScriptPubKey(HASH)));
  assert.equal(bytesToHex(transparentScriptPubKey(testnet, "testnet")), bytesToHex(p2shScriptPubKey(HASH)));
  assert.throws(() => transparentScriptPubKey(mainnet, "testnet"), /wrong Zcash network/);
  assert.throws(() => parseP2shScriptPubKey(Uint8Array.of(0xa9, 0x14, ...HASH, 0x88)), /canonical P2SH/);
});

test("address parsing fails closed on checksum, prefix, length, and alphabet errors", () => {
  const address = encodeTransparentAddress("testnet", "p2sh", HASH);
  const changed = `${address.slice(0, -1)}${address.endsWith("1") ? "2" : "1"}`;
  assert.throws(() => decodeTransparentAddress(changed), /checksum/);
  assert.throws(() => decodeTransparentAddress(` ${address}`), /whitespace/);
  assert.throws(() => decodeTransparentAddress(address.replace("2", "0")), /invalid character/);
  assert.throws(() => decodeTransparentAddress("111111"), /two-byte prefix/);
  assert.throws(() => encodeTransparentAddress("testnet", "p2sh", new Uint8Array(19)), /20 bytes/);
});

test("display transaction IDs reverse exactly once for serialized prevouts", () => {
  const txid = "000102030405060708090a0b0c0d0e0f101112131415161718191a1b1c1d1e1f";
  const serialized = txidHexToPrevoutBytes(txid);
  assert.equal(bytesToHex(serialized), "1f1e1d1c1b1a191817161514131211100f0e0d0c0b0a09080706050403020100");
  assert.equal(prevoutBytesToTxidHex(serialized), txid);
  assert.throws(() => txidHexToPrevoutBytes("00".repeat(31)), /32 bytes/);
  assert.throws(() => prevoutBytesToTxidHex(new Uint8Array(31)), /32 bytes/);
});
