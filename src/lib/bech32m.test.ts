import { strict as assert } from "node:assert";
import { test } from "node:test";

import { BECH32M_MAXIMUM_LENGTH, convertBits, decodeBech32m, encodeBech32m } from "./bech32m.ts";

// Vectors are the bech32m sets from BIP 350, "Bech32m format for v1+
// witness addresses". They exercise the checksum and the string-level
// rules only; the data part of several of them is not a whole number of
// bytes, which is a separate question from whether the string is a valid
// bech32m string.
const VALID_STRINGS = [
  "A1LQFN3A",
  "a1lqfn3a",
  "an83characterlonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11sg7hg6",
  "abcdef1l7aum6echk45nj3s0wdvt2fg8x9yrzpqzd3ryx",
  "split1checkupstagehandshakeupstreamerranterredcaperredlc445v",
  "?1v759aa",
] as const;

const INVALID_STRINGS: ReadonlyArray<readonly [string, string]> = [
  [" 1xj0phk", "HRP character below 33 (space)"],
  ["\u007f1g6xzxy", "HRP character above 126 (DEL)"],
  ["\u00801vctc34", "HRP character outside US-ASCII"],
  [
    "an84characterslonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11d6pts4",
    "overall maximum length exceeded",
  ],
  ["qyrz8wqd2c9m", "no separator character"],
  ["1qyrz8wqd2c9m", "empty human-readable part"],
  ["y1b0jsk6g", "invalid data character"],
  ["lt1igcx5c0", "invalid data character"],
  ["in1muywd", "checksum shorter than six characters"],
  ["mm1crxm3i", "invalid character in the checksum"],
  ["au1s5cgom", "invalid character in the checksum"],
  ["M1VUXWEZ", "checksum calculated over the uppercase HRP"],
  ["16plkw9", "empty data section"],
  ["1p2gdwpf", "empty data section"],
];

test("accepts the BIP 350 valid bech32m strings", () => {
  for (const address of VALID_STRINGS) {
    // decodeBech32m also regroups the data part back into bytes, which a
    // checksum-only vector need not satisfy. A checksum failure is the
    // outcome under test, so only that message is disallowed here.
    try {
      decodeBech32m(address);
    } catch (error) {
      assert.doesNotMatch(String(error), /checksum|separator|HRP|maximum/, `rejected ${address}`);
    }
  }
});

test("rejects every BIP 350 invalid bech32m string", () => {
  for (const [address, reason] of INVALID_STRINGS) {
    assert.throws(() => decodeBech32m(address), `accepted ${JSON.stringify(address)}: ${reason}`);
  }
});

test("rejects a human-readable part outside US-ASCII 33..126", () => {
  // hrpExpand splits each code unit into code >> 5 and code & 31, so a code
  // point above 126 aliases onto the expansion of a legal HRP and can carry
  // a checksum that verifies. The range has to be checked directly.
  assert.throws(() => decodeBech32m("\u00801vctc34"), /US-ASCII/);
  assert.throws(() => decodeBech32m("\u007f1g6xzxy"), /US-ASCII/);
  assert.throws(() => decodeBech32m(" 1xj0phk"), /US-ASCII/);
});

test("rejects a string longer than the 90-character maximum in both directions", () => {
  assert.throws(
    () => decodeBech32m("an84characterslonghumanreadablepartthatcontainsthetheexcludedcharactersbioandnumber11d6pts4"),
    /90-character/,
  );
  // 55 payload bytes encode to 88 data characters, which with a 3-character
  // HRP, the separator and the checksum passes 90.
  assert.throws(() => encodeBech32m("tex", new Uint8Array(55)), /90-character/);
});

test("round-trips every payload length that fits inside the maximum", () => {
  for (let length = 1; length <= 48; length += 1) {
    const payload = Uint8Array.from({ length }, (_, index) => (index * 37 + length) & 0xff);
    const encoded = encodeBech32m("tex", payload);
    assert.ok(encoded.length <= BECH32M_MAXIMUM_LENGTH);
    const decoded = decodeBech32m(encoded);
    assert.equal(decoded.hrp, "tex");
    assert.deepEqual([...decoded.payload], [...payload]);
  }
});

test("accepts the uppercase form of an encoded address and returns a lowercase HRP", () => {
  const encoded = encodeBech32m("tex", new Uint8Array(20).fill(0xab));
  const decoded = decodeBech32m(encoded.toUpperCase());
  assert.equal(decoded.hrp, "tex");
  assert.deepEqual([...decoded.payload], new Array(20).fill(0xab));
});

test("rejects a mixed-case string", () => {
  const encoded = encodeBech32m("tex", new Uint8Array(20));
  const mixed = `${encoded.slice(0, 4).toUpperCase()}${encoded.slice(4)}`;
  assert.throws(() => decodeBech32m(mixed), /mixed case/);
});

test("rejects a single flipped character", () => {
  const encoded = encodeBech32m("tex", new Uint8Array(20).fill(0x11));
  for (let index = 4; index < encoded.length; index += 1) {
    const original = encoded[index];
    const replacement = original === "q" ? "p" : "q";
    const corrupted = `${encoded.slice(0, index)}${replacement}${encoded.slice(index + 1)}`;
    assert.throws(() => decodeBech32m(corrupted), `accepted a flip at index ${index}`);
  }
});

test("encodeBech32m rejects a human-readable part that is not lowercase alphanumeric", () => {
  assert.throws(() => encodeBech32m("TEX", new Uint8Array(20)), /lowercase alphanumeric/);
  assert.throws(() => encodeBech32m("", new Uint8Array(20)), /lowercase alphanumeric/);
  assert.throws(() => encodeBech32m("te-x", new Uint8Array(20)), /lowercase alphanumeric/);
});

test("convertBits pads to five-bit groups with zeroes and reads them back", () => {
  // One byte is eight bits, which is two five-bit groups with two bits of
  // zero padding on the end.
  const groups = convertBits(new Uint8Array([0xff]), 8, 5, true);
  assert.deepEqual(groups, [0b11111, 0b11100]);
  assert.deepEqual(convertBits(groups, 5, 8, false), [0xff]);
  // Five bytes are exactly eight groups, so there is no padding at all.
  assert.deepEqual(convertBits(convertBits(new Uint8Array([0xff, 0xff, 0xff, 0xff, 0xff]), 8, 5, true), 5, 8, false), [
    0xff, 0xff, 0xff, 0xff, 0xff,
  ]);
});

test("convertBits rejects non-zero padding bits when it is not allowed to pad", () => {
  // 0b11101 carries a 1 in the two bits that the encoder must leave zero,
  // so this group pair never came from a whole number of bytes.
  assert.throws(() => convertBits([0b11111, 0b11101], 5, 8, false), /padding is invalid/);
  // A leftover of a full source group is also invalid: three five-bit
  // groups are fifteen bits, which is one byte and seven spare bits.
  assert.throws(() => convertBits([0b11111, 0b11111, 0b11111], 5, 8, false), /padding is invalid/);
});

test("convertBits rejects a group that is out of range for its width", () => {
  assert.throws(() => convertBits([32], 5, 8, true), /out of range/);
  assert.throws(() => convertBits([-1], 5, 8, true), /out of range/);
  assert.throws(() => convertBits([256], 8, 5, true), /out of range/);
});
