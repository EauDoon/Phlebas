import { strict as assert } from "node:assert";
import { test } from "node:test";

import { parseOutpoint, serializeOutpoint } from "./zcash-outpoint.ts";

test("serializeOutpoint emits 36 bytes with the txid in little-endian and a 0x prefix", () => {
  const outpoint = { txid: "ab".repeat(32), vout: 0 };
  const hex = serializeOutpoint(outpoint);
  assert.equal(hex.length, 74); // 0x + 72 hex chars
  assert.ok(hex.startsWith("0x"));
  // "ab" is a palindrome in 2-char blocks, so the reversed form is the same string.
  assert.equal(hex.slice(2, 66), "ab".repeat(32));
  assert.equal(hex.slice(66), "00000000");
});

test("serializeOutpoint encodes the vout in little-endian uint32", () => {
  const outpoint = { txid: "ab".repeat(32), vout: 0x01020304 };
  const hex = serializeOutpoint(outpoint);
  assert.equal(hex.slice(66), "04030201");
});

test("serializeOutpoint rejects an out-of-range vout", () => {
  assert.throws(
    () => serializeOutpoint({ txid: "ab".repeat(32), vout: -1 }),
    /uint32/,
  );
  assert.throws(
    () => serializeOutpoint({ txid: "ab".repeat(32), vout: 0x100000000 }),
    /uint32/,
  );
});

test("serializeOutpoint rejects a wrong-length txid", () => {
  assert.throws(() => serializeOutpoint({ txid: "ab", vout: 0 }), /32 bytes hex/);
});

test("parseOutpoint reads a serialized outpoint with a 0x prefix", () => {
  const original = { txid: "ab".repeat(32), vout: 0x01020304 };
  const hex = serializeOutpoint(original);
  const parsed = parseOutpoint(hex);
  assert.equal(parsed.txid, original.txid);
  assert.equal(parsed.vout, original.vout);
});

test("parseOutpoint accepts the hex without a 0x prefix", () => {
  const original = { txid: "ab".repeat(32), vout: 0x01020304 };
  const hex = serializeOutpoint(original);
  const noPrefix = hex.slice(2);
  const parsed = parseOutpoint(noPrefix);
  assert.equal(parsed.txid, original.txid);
  assert.equal(parsed.vout, original.vout);
});

test("parseOutpoint rejects a wrong-length hex", () => {
  assert.throws(() => parseOutpoint("0x" + "ab".repeat(10)), /36 bytes/);
});

test("parseOutpoint round-trips with vout zero", () => {
  const original = { txid: "12".repeat(32), vout: 0 };
  const parsed = parseOutpoint(serializeOutpoint(original));
  assert.equal(parsed.txid, original.txid);
  assert.equal(parsed.vout, 0);
});
