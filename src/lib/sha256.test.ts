import assert from "node:assert/strict";
import test from "node:test";

import { sha256Hex } from "./sha256.ts";

test("matches standard SHA-256 vectors", () => {
  assert.equal(sha256Hex(""), "0xe3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  assert.equal(sha256Hex("abc"), "0xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(
    sha256Hex("The quick brown fox jumps over the lazy dog"),
    "0xd7a8fbb307d7809469ca9abcb0082e4f8d5651e46d3cdb762d02d0bf37c9e592",
  );
});

test("hashes bytes without Node-only dependencies", () => {
  assert.equal(sha256Hex(new Uint8Array([0, 1, 2, 255])), "0x3d1f57c984978ef98a18378c8166c1cb8ede02c03eeb6aee7e2f121dfeee3e56");
});
