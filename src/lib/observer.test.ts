import assert from "node:assert/strict";
import test from "node:test";

import { hexToBytes } from "./keccak.ts";
import { agreeObservations, applyReorg, confirmationsAtTip, parseStubObservation } from "./observer.ts";
import { encodeTex } from "./tex.ts";

const TEX = encodeTex(hexToBytes("00112233445566778899aabbccddeeff00112233"));
const TXID = "ab".repeat(32);
const BLOCK = "cd".repeat(32);

test("stub observer accepts textest and counts confirmations from the tip", () => {
  const observed = parseStubObservation({
    txid: TXID,
    vout: 0,
    amountZatoshis: 100_000_000n,
    tex: TEX,
    blockHeight: 10,
    blockHash: BLOCK,
    tipHeight: 19,
    transparentInputsOnly: true,
    transparentOutputsOnly: true,
    shieldedBundle: false,
  });
  assert.equal(observed.network, "testnet");
  assert.equal(observed.confirmations, 10);
  assert.equal(confirmationsAtTip(10, 9), 0);
});

test("stub observer rejects non-testnet destinations and empty observer sets", () => {
  assert.throws(() => parseStubObservation({
    txid: TXID,
    vout: 0,
    amountZatoshis: 1n,
    tex: "tex1short",
    blockHeight: 1,
    blockHash: BLOCK,
    tipHeight: 20,
    transparentInputsOnly: true,
    transparentOutputsOnly: true,
    shieldedBundle: false,
  }), /textest/);
  assert.throws(() => agreeObservations([]), /empty/);
});

test("disagreement stops minting", () => {
  const first = parseStubObservation({
    txid: TXID,
    vout: 0,
    amountZatoshis: 1n,
    tex: TEX,
    blockHeight: 1,
    blockHash: BLOCK,
    tipHeight: 20,
    transparentInputsOnly: true,
    transparentOutputsOnly: true,
    shieldedBundle: false,
  });
  const second = { ...first, amountZatoshis: 2n };
  assert.throws(() => agreeObservations([first, second]), /disagreement/);
  assert.throws(() => agreeObservations([first, { ...first, shieldedBundle: true }]), /disagreement/);
  assert.equal(agreeObservations([first, { ...first, confirmations: 9 }]).confirmations, 9);
});

test("reorg drops observations that leave the chain", () => {
  const observed = parseStubObservation({
    txid: TXID,
    vout: 0,
    amountZatoshis: 1n,
    tex: TEX,
    blockHeight: 1,
    blockHash: BLOCK,
    tipHeight: 20,
    transparentInputsOnly: true,
    transparentOutputsOnly: true,
    shieldedBundle: false,
  });
  assert.equal(applyReorg(observed, false), "drop");
  assert.equal(applyReorg(observed, true), "keep");
  assert.equal(applyReorg({ ...observed, confirmations: 1 }, true), "drop");
});
