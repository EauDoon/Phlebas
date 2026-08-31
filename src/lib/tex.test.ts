import assert from "node:assert/strict";
import test from "node:test";

import { hexToBytes } from "./keccak.ts";
import { decodeTex, encodeTex, encodeTexFromHashHex, isTestnetTex } from "./tex.ts";
import { emptyDepositLedger, issueDepositIntent, paymentRequestFor } from "./deposit-intent.ts";

const HASH = "00112233445566778899aabbccddeeff00112233";

test("testnet TEX round-trips a 20-byte P2PKH payload", () => {
  const payload = hexToBytes(HASH);
  const address = encodeTex(payload);
  assert.match(address, /^textest1[0-9a-z]+$/);
  assert.doesNotMatch(address, /^tex1/);
  assert.equal(decodeTex(address).network, "testnet");
  assert.equal(Buffer.from(decodeTex(address).payload).toString("hex"), HASH);
  assert.equal(encodeTexFromHashHex(HASH), address);
  assert.equal(isTestnetTex(address), true);
});

test("rejects mainnet encoding and bad checksums", () => {
  assert.throws(() => encodeTex(hexToBytes(HASH), "mainnet"), /testnet TEX only/);
  const address = encodeTex(hexToBytes(HASH));
  const broken = `${address.slice(0, -1)}${address.endsWith("q") ? "p" : "q"}`;
  assert.throws(() => decodeTex(broken), /checksum|character|padding/);
  assert.equal(isTestnetTex("t1nottex"), false);
});

test("deposit ledger never reassigns a receiver or intent id", () => {
  const ledger = emptyDepositLedger();
  const first = issueDepositIntent(ledger, {
    id: "intent-1",
    payload: hexToBytes(HASH),
    amountZatoshis: 100_000_000n,
    createdAt: "2026-08-31T00:00:00.000Z",
  });
  assert.equal(first.network, "testnet");
  assert.match(first.tex, /^textest1/);
  assert.equal(paymentRequestFor(first), `zcash:${first.tex}?amount=1&label=Phlebas`);
  assert.throws(() => issueDepositIntent(ledger, {
    id: "intent-1",
    payload: hexToBytes("ff".repeat(20)),
    amountZatoshis: 1n,
  }), /already assigned/);
  assert.throws(() => issueDepositIntent(ledger, {
    id: "intent-2",
    payload: hexToBytes(HASH),
    amountZatoshis: 1n,
  }), /already assigned/);
});

test("invalid amounts do not consume a deposit intent or receiver", () => {
  const ledger = emptyDepositLedger();
  assert.throws(() => issueDepositIntent(ledger, {
    id: "intent-1",
    payload: hexToBytes(HASH),
    amountZatoshis: 0n,
  }), /1 zatoshi/);
  const intent = issueDepositIntent(ledger, {
    id: "intent-1",
    payload: hexToBytes(HASH),
    amountZatoshis: 1n,
  });
  assert.equal(intent.id, "intent-1");
});
