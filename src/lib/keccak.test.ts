import assert from "node:assert/strict";
import test from "node:test";

import { hexToBytes, keccak256Hex } from "./keccak.ts";

test("keccak256 matches Ethereum empty and abc vectors", () => {
  assert.equal(
    keccak256Hex(new Uint8Array()),
    "c5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470",
  );
  assert.equal(
    keccak256Hex("abc"),
    "4e03657aea45a94fc7d47ba826c8d667c0d1e6e33a64a036ec44f58fa12d6c45",
  );
});

test("keccak256 matches a longer Ethereum vector", () => {
  assert.equal(
    keccak256Hex(hexToBytes("00")),
    "bc36789e7a1e281436464229828f817d6612f7b477d66591ff96a9e064bcc98a",
  );
  assert.equal(
    keccak256Hex("hello"),
    "1c8aff950685c2ed4bc3174f3472287b56d9517b9c948127319a09a7a36deac8",
  );
  assert.equal(
    keccak256Hex("The quick brown fox jumps over the lazy dog"),
    "4d741b6f1eb29cb2a9b9911c82f56fa8d73b04959d3d9d222895df6c0b28aa15",
  );
});
