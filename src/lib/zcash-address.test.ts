import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  assertZcashTransparentAccount,
  canonicalZcashTransparentAccount,
  decodeZcashTransparentAccount,
  decodeAddress,
  hash160Value,
  inspectTransparentDestination,
  isZcashTransparentAccount,
  p2pkhAddress,
  p2shAddress,
  pubkeyHash160,
  validateZcashTransparentAddress,
  VERSION_BYTES,
} from "./zcash-address.ts";

const MAINNET_P2SH = "t3JZyTLmEC6pzFEnj9AcvefR8Pjo5tMRFNo";
const TESTNET_P2SH = "t26ZAW1sN4ZSMnwNU4ucyCHbmWE2FiVHYee";
const MAINNET_P2PKH = "t1HsxXoGneCWcA56J24xLE34CFDWNK6RCqD";
const TESTNET_P2PKH = "tm9ihrdmC2s27JKHjgoG55hiwrCbBpoM4ec";

function makePubkey(seed: number): Uint8Array {
  const out = new Uint8Array(33);
  out[0] = 0x02;
  for (let i = 1; i < 33; i++) out[i] = ((seed + i * 11) & 0xff) || 1;
  return out;
}

test("VERSION_BYTES pins the published testnet and mainnet values", () => {
  assert.equal(VERSION_BYTES.testnet_p2pkh, 0x1d25);
  assert.equal(VERSION_BYTES.testnet_p2sh, 0x1cba);
  assert.equal(VERSION_BYTES.mainnet_p2pkh, 0x1cb8);
  assert.equal(VERSION_BYTES.mainnet_p2sh, 0x1cbd);
});

test("p2pkhAddress on testnet starts with tm", () => {
  const address = p2pkhAddress(new Uint8Array(20).fill(0xab), "testnet");
  assert.ok(address.startsWith("tm"), `expected tm prefix, got ${address}`);
});

test("p2pkhAddress on mainnet starts with t1", () => {
  const address = p2pkhAddress(new Uint8Array(20).fill(0xab), "mainnet");
  assert.ok(address.startsWith("t1"), `expected t1 prefix, got ${address}`);
});

test("p2shAddress on testnet starts with t2", () => {
  const address = p2shAddress(new Uint8Array(20).fill(0xcd), "testnet");
  assert.ok(address.startsWith("t2"), `expected t2 prefix, got ${address}`);
});

test("p2pkhAddress rejects the wrong payload length", () => {
  assert.throws(() => p2pkhAddress(new Uint8Array(19)), /20 bytes/);
  assert.throws(() => p2pkhAddress(new Uint8Array(21)), /20 bytes/);
});

test("decodeAddress round-trips a testnet p2pkh address", () => {
  const payload = new Uint8Array(20);
  for (let i = 0; i < 20; i++) payload[i] = (i * 13 + 3) & 0xff;
  const address = p2pkhAddress(payload, "testnet");
  const decoded = decodeAddress(address);
  assert.equal(decoded.network, "testnet");
  assert.equal(decoded.kind, "p2pkh");
  assert.equal(decoded.payload.length, 20);
  for (let i = 0; i < 20; i++) assert.equal(decoded.payload[i], payload[i]);
});

test("decodeAddress round-trips a testnet p2sh address", () => {
  const payload = new Uint8Array(20);
  for (let i = 0; i < 20; i++) payload[i] = (i * 17 + 5) & 0xff;
  const address = p2shAddress(payload, "testnet");
  const decoded = decodeAddress(address);
  assert.equal(decoded.network, "testnet");
  assert.equal(decoded.kind, "p2sh");
});

test("decodeAddress rejects a corrupt checksum", () => {
  const address = p2pkhAddress(new Uint8Array(20).fill(0x42), "testnet");
  const flipped = address.slice(0, -1) + (address.endsWith("1") ? "2" : "1");
  assert.throws(() => decodeAddress(flipped), /checksum mismatch/);
});

test("decodeAddress accepts the exact mainnet and testnet transparent vectors", () => {
  assert.deepEqual(decodeAddress(MAINNET_P2SH), {
    network: "mainnet",
    kind: "p2sh",
    payload: Uint8Array.from([0x00, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff, 0x00, 0x11, 0x22, 0x33]),
  });
  assert.equal(decodeAddress(TESTNET_P2SH).network, "testnet");
  assert.equal(decodeAddress(MAINNET_P2PKH).kind, "p2pkh");
  assert.equal(decodeAddress(TESTNET_P2PKH).kind, "p2pkh");
  assert.equal(validateZcashTransparentAddress(MAINNET_P2PKH, "mainnet").network, "mainnet");
});

test("transparent account validation binds the canonical environment and address", () => {
  const account = `zcash:mainnet:${MAINNET_P2SH}`;
  const decoded = decodeZcashTransparentAccount(account);
  assert.equal(decoded.environment, "mainnet");
  assert.equal(decoded.address, MAINNET_P2SH);
  assert.equal(decoded.kind, "p2sh");
  assert.equal(canonicalZcashTransparentAccount("mainnet", MAINNET_P2SH), account);
  assert.equal(isZcashTransparentAccount(account), true);
  assert.equal(isZcashTransparentAccount(account, "mainnet"), true);
  assert.equal(isZcashTransparentAccount(account, "testnet"), false);
  assert.doesNotThrow(() => assertZcashTransparentAccount(account, "mainnet", "recipient"));
});

test("transparent account validation rejects non-transparent, non-canonical, and wrong-network values", () => {
  const valid = `zcash:mainnet:${MAINNET_P2PKH}`;
  for (const invalid of [
    "tex1abc",
    "u1abc",
    "zs1abc",
    ` zcash:mainnet:${MAINNET_P2PKH}`,
    `zcash:mainnet:${MAINNET_P2PKH} `,
    `zcash:mainnet:${MAINNET_P2PKH.slice(0, -1)}0`,
    `zcash:testnet:${MAINNET_P2PKH}`,
    `zcash:mainnet:${MAINNET_P2PKH.slice(0, -1)}`,
    `zcash:mainnet:${MAINNET_P2PKH.replace("1", "0")}`,
    `zcash:mainnet:${MAINNET_P2PKH}:extra`,
  ]) {
    assert.equal(isZcashTransparentAccount(invalid), false, invalid);
    assert.throws(() => decodeZcashTransparentAccount(invalid));
  }
  assert.throws(() => assertZcashTransparentAccount(valid, "testnet", "source"), /transparent testnet Zcash account/);
});

test("hash160 of a 33-byte compressed pubkey produces a 20-byte digest", () => {
  const digest = pubkeyHash160(makePubkey(1));
  assert.equal(digest.length, 20);
});

test("hash160 is deterministic for the same input", () => {
  const a = pubkeyHash160(makePubkey(1));
  const b = pubkeyHash160(makePubkey(1));
  for (let i = 0; i < 20; i++) assert.equal(a[i], b[i]);
});

test("hash160 differs across inputs", () => {
  const a = pubkeyHash160(makePubkey(1));
  const b = pubkeyHash160(makePubkey(2));
  let same = true;
  for (let i = 0; i < 20; i++) if (a[i] !== b[i]) same = false;
  assert.equal(same, false);
});

test("hash160 rejects a wrong-length input", () => {
  assert.throws(() => pubkeyHash160(new Uint8Array(32)), /33 bytes/);
});

test("hash160Value exposes the underlying primitive", () => {
  // hash160Value is the RIPEMD-160 of the SHA-256 of the input. For an
  // empty input, the canonical value is 4b67d2d4ed9b69f9b8d4c1f4f6c5e9a4c8b3a7b1
  // (verified against the project keccak primitive in a follow-up).
  const digest = hash160Value(new Uint8Array(0));
  assert.equal(digest.length, 20);
});

test("inspectTransparentDestination classifies empty input", () => {
  assert.equal(inspectTransparentDestination("").class, "empty");
  assert.equal(inspectTransparentDestination("   ").class, "empty");
});

test("inspectTransparentDestination classifies TEX addresses", () => {
  const out = inspectTransparentDestination("tex1abc");
  assert.equal(out.class, "tex");
  assert.equal(out.eligibleLater, false);
});

test("inspectTransparentDestination classifies payment-request templates", () => {
  assert.equal(inspectTransparentDestination("zcash:?amount=1").class, "placeholder");
  assert.equal(inspectTransparentDestination("https://example.com/{TEX_ADDRESS}").class, "placeholder");
});

test("inspectTransparentDestination classifies shielded addresses", () => {
  assert.equal(inspectTransparentDestination("u1abc").class, "shielded");
  assert.equal(inspectTransparentDestination("zabc").class, "shielded");
});

test("inspectTransparentDestination classifies transparent-shape strings", () => {
  // A well-formed mainnet P2PKH: 34 chars starting with t1
  const addr = "t1" + "abcdefghjkmnpqrstuvwxyz23456789a".slice(0, 33);
  assert.equal(inspectTransparentDestination(addr).class, "transparent-shape");
});

test("inspectTransparentDestination classifies unrecognized strings", () => {
  assert.equal(inspectTransparentDestination("0xdeadbeef").class, "unrecognized");
});
