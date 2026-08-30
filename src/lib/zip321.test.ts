import assert from "node:assert/strict";
import test from "node:test";

import {
  buildZip321Uri,
  formatZip321Amount,
  SYNTHETIC_TEX_PLACEHOLDER,
  syntheticDepositRequest,
} from "./zip321.ts";

test("formats ZIP 321 amounts without trailing zeros or exponent notation", () => {
  assert.equal(formatZip321Amount(1n), "0.00000001");
  assert.equal(formatZip321Amount(100_000_000n), "1");
  assert.equal(formatZip321Amount(150_000_000n), "1.5");
  assert.equal(formatZip321Amount(2_100_000_000_000_000n), "21000000");
});

test("rejects zero and over-supply ZIP 321 amounts", () => {
  assert.throws(() => formatZip321Amount(0n), /1 zatoshi/);
  assert.throws(() => formatZip321Amount(2_100_000_000_000_001n), /21,000,000 ZEC/);
});

test("emits a path-form payment request with amount before label", () => {
  assert.equal(
    buildZip321Uri({ address: "textest1example", amountZatoshis: 100_000_000n }),
    "zcash:textest1example?amount=1&label=Phlebas",
  );
  assert.equal(
    buildZip321Uri({ address: "textest1example" }),
    "zcash:textest1example?label=Phlebas",
  );
});

test("rejects an empty or parameterized address", () => {
  assert.throws(() => buildZip321Uri({ address: "" }), /single path value/);
  assert.throws(() => buildZip321Uri({ address: "tex1abc?amount=1" }), /single path value/);
});

test("synthetic deposit request is not a receivable TEX address", () => {
  const uri = syntheticDepositRequest();
  assert.equal(uri, `zcash:${SYNTHETIC_TEX_PLACEHOLDER}?amount=1&label=Phlebas`);
  assert.match(uri, /^zcash:\{TEX_ADDRESS\}\?amount=1&label=Phlebas$/);
  assert.doesNotMatch(uri, /tex1|textest1/);
});
