import assert from "node:assert/strict";
import test from "node:test";

import { verifyZcashTransparentSignedMessage } from "./zcash-signed-message.ts";
import vectorsDocument from "../../tests/fixtures/zcash-message/synthetic-vectors.json" with { type: "json" };

test("verifies independent compact-message vectors including the 252/253 CompactSize boundary", () => {
  assert.equal(vectorsDocument.provenance.synthetic, true);
  for (const vector of vectorsDocument.vectors) {
    assert.equal(
      verifyZcashTransparentSignedMessage(vector.account, vector.message, vector.signatureBase64),
      true,
      vector.name,
    );
  }
});

test("rejects a signature made with the wrong signed-message magic", () => {
  const wrongMagic = vectorsDocument.negative.wrongMagic;
  assert.equal(
    verifyZcashTransparentSignedMessage(
      wrongMagic.account,
      wrongMagic.message,
      wrongMagic.signatureBase64,
    ),
    false,
  );
  assert.equal(
    verifyZcashTransparentSignedMessage(
      wrongMagic.account,
      "wrong-magic-test?",
      wrongMagic.signatureBase64,
    ),
    false,
  );
});

test("binds the recovered key to the exact mainnet P2PKH account", () => {
  const first = vectorsDocument.vectors[0];
  const second = vectorsDocument.vectors[1];
  assert.equal(
    verifyZcashTransparentSignedMessage(first.account, second.message, second.signatureBase64),
    false,
  );
  assert.equal(
    verifyZcashTransparentSignedMessage(first.account, first.message, second.signatureBase64),
    false,
  );
  assert.equal(
    verifyZcashTransparentSignedMessage(
      vectorsDocument.negative.wrongNetworkAccount,
      first.message,
      first.signatureBase64,
    ),
    false,
  );
  assert.equal(
    verifyZcashTransparentSignedMessage(
      vectorsDocument.negative.wrongKindAccount,
      first.message,
      first.signatureBase64,
    ),
    false,
  );
  for (const account of [
    "zcash:mainnet:",
    first.account.slice(0, -1),
    first.account + "x",
    first.account.replace("mainnet", "testnet"),
    "zcash:mainnet:not-an-address",
  ]) {
    assert.equal(
      verifyZcashTransparentSignedMessage(account, first.message, first.signatureBase64),
      false,
      account,
    );
  }
});

test("enforces printable-ASCII challenge bounds", () => {
  const vector = vectorsDocument.vectors[0];
  for (const message of [
    "",
    "0123456789ABCDE",
    "x".repeat(513),
    "0123456789ABC\nDEF",
    "0123456789ABCDE\u007f",
    "0123456789ABCDEé",
  ]) {
    assert.equal(
      verifyZcashTransparentSignedMessage(vector.account, message, vector.signatureBase64),
      false,
      "message length/content " + message.length,
    );
  }
});

test("requires canonical standard Base64 for the 65-byte compact signature", () => {
  const vector = vectorsDocument.vectors[0];
  const malformed = [
    vector.signatureBase64.slice(0, -2) + "F=", // Same decoded bytes with nonzero padding bits.
    vector.signatureBase64.slice(0, -1),
    vector.signatureBase64.slice(0, -1) + "==",
    vector.signatureBase64.slice(0, 10) + "-" + vector.signatureBase64.slice(11),
    vector.signatureBase64.slice(0, 10) + " " + vector.signatureBase64.slice(11),
    vector.signatureBase64 + "\n",
    "A" + vector.signatureBase64.slice(1),
  ];
  for (const signature of malformed) {
    assert.equal(
      verifyZcashTransparentSignedMessage(vector.account, vector.message, signature),
      false,
      signature,
    );
  }
});
