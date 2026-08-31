import { strict as assert } from "node:assert";
import { test } from "node:test";

import { sha256d, sha256dHex } from "./sha256d.ts";
import { createHash } from "node:crypto";

function ascii(input: string): Uint8Array {
  return new TextEncoder().encode(input);
}

test("sha256d of empty string is the well-known empty SHA-256d", () => {
  // SHA-256("") = e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
  // SHA-256d is SHA-256(SHA-256("")) = 5df6e0e2761359d30a8275058e299fcc0381534545f55cf43c4195740d1d2a8
  const expected = createHash("sha256");
  expected.update(createHash("sha256").update(new Uint8Array(0)).digest());
  assert.equal(sha256dHex(ascii("")), expected.digest("hex"));
});

test("sha256d is deterministic for the same input", () => {
  assert.equal(sha256dHex(ascii("abc")), sha256dHex(ascii("abc")));
});

test("sha256d changes with even a one-byte change", () => {
  assert.notEqual(sha256dHex(ascii("a")), sha256dHex(ascii("b")));
});

test("sha256d returns a 32-byte digest", () => {
  assert.equal(sha256d(ascii("message")).length, 32);
});
