import assert from "node:assert/strict";
import test from "node:test";

import { placeholderQrModules } from "./placeholder-qr.ts";

test("placeholder QR has finder squares and changes with the payload", () => {
  const first = placeholderQrModules("zcash:{TEX_ADDRESS}?amount=1&label=Phlebas");
  const second = placeholderQrModules("zcash:textest1example?amount=1&label=Phlebas");
  assert.equal(first.length, 21);
  assert.equal(first[0]?.[0], true);
  assert.equal(first[6]?.[6], true);
  assert.equal(first[2]?.[2], true);
  assert.equal(first[0]?.[20], true);
  assert.equal(first[20]?.[0], true);
  const firstFlat = first.flat().map((cell) => (cell ? "1" : "0")).join("");
  const secondFlat = second.flat().map((cell) => (cell ? "1" : "0")).join("");
  assert.notEqual(firstFlat, secondFlat);
});
