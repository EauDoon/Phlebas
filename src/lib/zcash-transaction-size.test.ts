import assert from "node:assert/strict";
import { test } from "node:test";

import {
  computeFundingTransactionSize,
  computeTransparentTransactionSize,
} from "./zcash-transaction-size.ts";

// P2SH scriptPubKey: OP_HASH160 <20-byte hash> OP_EQUAL (23 bytes).
const P2SH_SCRIPT_PUBKEY_HEX = "a914" + "11".repeat(20) + "87";
// P2PKH scriptPubKey: OP_DUP OP_HASH160 <20-byte hash> OP_EQUALVERIFY OP_CHECKSIG (25 bytes).
const P2PKH_SCRIPT_PUBKEY_HEX = "76a914" + "22".repeat(20) + "88ac";

test("varint size matches Bitcoin CompactSize encoding", () => {
  // Crossing the 252 → 253 boundary adds the new input (41 bytes for an
  // empty P2PKH-shaped input) and upgrades the input-count varint from
  // 1 byte to 3 bytes. The total delta is therefore 43.
  const at252 = computeTransparentTransactionSize({
    version: 4,
    inputs: Array.from({ length: 252 }, () => ({ scriptSigLength: 0 })),
    outputs: [{ scriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX }],
    lockTime: 0,
  });
  const at253 = computeTransparentTransactionSize({
    version: 4,
    inputs: Array.from({ length: 253 }, () => ({ scriptSigLength: 0 })),
    outputs: [{ scriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX }],
    lockTime: 0,
  });
  assert.equal(at253 - at252, 43, "252→253 inputs add 41 (new input) + 2 (varint upgrade)");
});

test("version 4 fund with one empty input and one P2SH output matches the manual count", () => {
  // 4 (version) + 1 (1 input varint) + 32 + 4 + 1 + 0 + 4 (input) + 1 (1 output varint) + 8 + 1 + 23 (output) + 4 (lockTime)
  const size = computeTransparentTransactionSize({
    version: 4,
    inputs: [{ scriptSigLength: 0 }],
    outputs: [{ scriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX }],
    lockTime: 0,
  });
  assert.equal(size, 4 + 1 + 32 + 4 + 1 + 0 + 4 + 1 + 8 + 1 + 23 + 4);
});

test("version 5 fund adds the group id and the expiry height", () => {
  const v4 = computeTransparentTransactionSize({
    version: 4,
    inputs: [{ scriptSigLength: 0 }],
    outputs: [{ scriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX }],
    lockTime: 0,
  });
  const v5 = computeTransparentTransactionSize({
    version: 5,
    inputs: [{ scriptSigLength: 0 }],
    outputs: [{ scriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX }],
    lockTime: 0,
  });
  assert.equal(v5 - v4, 8, "version 5 adds the 4-byte group id and the 4-byte expiry height");
});

test("change output adds its exact serialized size", () => {
  const { withoutChange, withChange } = computeFundingTransactionSize({
    version: 5,
    inputCount: 1,
    fundingScriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX,
    changeScriptPubKeyHex: P2PKH_SCRIPT_PUBKEY_HEX,
    lockTime: 0,
  });
  // Adding one P2PKH output: 8 (value) + 1 (scriptPubKey varint) + 25
  // (scriptPubKey) = 34 bytes. The output-count varint stays at 1
  // byte because 1 and 2 are both single-byte CompactSize values.
  assert.equal(withChange - withoutChange, 34);
});

test("change output omission leaves withoutChange and withChange equal", () => {
  const { withoutChange, withChange } = computeFundingTransactionSize({
    version: 5,
    inputCount: 1,
    fundingScriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX,
    lockTime: 0,
  });
  assert.equal(withChange, withoutChange);
});

test("multi-input funding adds exactly one P2PKH-sized input per extra input", () => {
  const one = computeFundingTransactionSize({
    version: 5,
    inputCount: 1,
    fundingScriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX,
    lockTime: 0,
  });
  const three = computeFundingTransactionSize({
    version: 5,
    inputCount: 3,
    fundingScriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX,
    lockTime: 0,
  });
  // Each extra empty P2PKH input is 32 + 4 + 1 + 0 + 4 = 41 bytes.
  assert.equal(three.withoutChange - one.withoutChange, 2 * 41);
});

test("non-empty scriptSig length is reflected in the total size", () => {
  const empty = computeTransparentTransactionSize({
    version: 5,
    inputs: [{ scriptSigLength: 0 }],
    outputs: [{ scriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX }],
    lockTime: 0,
  });
  const withScriptSig = computeTransparentTransactionSize({
    version: 5,
    inputs: [{ scriptSigLength: 107 }],
    outputs: [{ scriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX }],
    lockTime: 0,
  });
  // The extra scriptSig bytes plus a larger varint (still 1 byte for < 253).
  assert.equal(withScriptSig - empty, 107);
});

test("rejects unknown version", () => {
  assert.throws(
    () =>
      computeTransparentTransactionSize({
        version: 3 as never,
        inputs: [],
        outputs: [],
        lockTime: 0,
      }),
    /version must be 4, 5, or 6/,
  );
});

test("rejects negative scriptSig length", () => {
  assert.throws(
    () =>
      computeTransparentTransactionSize({
        version: 4,
        inputs: [{ scriptSigLength: -1 }],
        outputs: [{ scriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX }],
        lockTime: 0,
      }),
    /non-negative/,
  );
});

test("rejects odd-length scriptPubKey hex", () => {
  assert.throws(
    () =>
      computeTransparentTransactionSize({
        version: 4,
        inputs: [{ scriptSigLength: 0 }],
        outputs: [{ scriptPubKeyHex: "a" }],
        lockTime: 0,
      }),
    /even number of nibbles/,
  );
});

test("rejects non-hex scriptPubKey characters", () => {
  assert.throws(
    () =>
      computeTransparentTransactionSize({
        version: 4,
        inputs: [{ scriptSigLength: 0 }],
        outputs: [{ scriptPubKeyHex: "0xZZ" + "11".repeat(11) }],
        lockTime: 0,
      }),
    /hexadecimal/,
  );
});

test("rejects out-of-range lockTime", () => {
  assert.throws(
    () =>
      computeTransparentTransactionSize({
        version: 4,
        inputs: [{ scriptSigLength: 0 }],
        outputs: [{ scriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX }],
        lockTime: -1,
      }),
    /unsigned 32-bit integer/,
  );
});

test("rejects zero-input funding convenience helper", () => {
  assert.throws(
    () =>
      computeFundingTransactionSize({
        version: 5,
        inputCount: 0,
        fundingScriptPubKeyHex: P2SH_SCRIPT_PUBKEY_HEX,
        lockTime: 0,
      }),
    /at least one input/,
  );
});
