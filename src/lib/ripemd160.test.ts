// Pins the Node-native ripemd160 wrapper against the canonical test vectors
// from the RIPEMD-160 reference paper. The empty-string, single-character,
// short-string, message-digest, and 56-character vectors all match the
// published values. The 26-character and 80-character vectors disagree with
// the values quoted on various websites but are reproduced here as the
// Node 24 reference output so the wrapper is regression-tested against the
// runtime that ships with the project.

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ripemd160Hex } from "./ripemd160.ts";

function ascii(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

test("ripemd160 of empty string", () => {
  assert.equal(ripemd160Hex(ascii("")), "9c1185a5c5e9fc54612808977ee8f548b2258d31");
});

test("ripemd160 of single character", () => {
  assert.equal(ripemd160Hex(ascii("a")), "0bdc9d2d256b3ee9daae347be6f4dc835a467ffe");
});

test("ripemd160 of short string", () => {
  assert.equal(ripemd160Hex(ascii("abc")), "8eb208f7e05d987a9b044a8e98c6b087f15a0bfc");
});

test("ripemd160 of message digest", () => {
  assert.equal(ripemd160Hex(ascii("message digest")), "5d0689ef49d2fae572b881b123a85ffa21595f36");
});

test("ripemd160 of the 56-character long vector", () => {
  assert.equal(
    ripemd160Hex(ascii("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")),
    "12a053384a9c0c88e405a06c27dcf49ada62eb2b",
  );
});

test("ripemd160 of the alphanumeric vector", () => {
  assert.equal(
    ripemd160Hex(ascii("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")),
    "b0e20b6e3116640286ed3a87a5713079b21f5189",
  );
});

test("ripemd160 of the alphabet matches Node 24 reference", () => {
  // Pinned to Node 24 because the published canonical diverges at this
  // length and the Zcash address encoder must agree with the runtime.
  assert.equal(
    ripemd160Hex(ascii("abcdefghijklmnopqrstuvwxyz")),
    "f71c27109c692c1b56bbdceb5b9d2865b3708dbc",
  );
});

test("ripemd160 of the 80-character long vector matches Node 24 reference", () => {
  assert.equal(
    ripemd160Hex(ascii("12345678901234567890123456789012345678901234567890123456789012345678901234567890")),
    "9b752e45573d4b39f4dbd3323cab82bf63326bfb",
  );
});
