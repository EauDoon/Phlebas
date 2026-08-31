import assert from "node:assert/strict";
import test from "node:test";

import { attestMint, emptyMintLedger } from "./attestation.ts";
import { hexToBytes } from "./keccak.ts";
import { parseStubObservation } from "./observer.ts";
import { encodeTex } from "./tex.ts";

const TEX = encodeTex(hexToBytes("00112233445566778899aabbccddeeff00112233"));
const TXID = "11".repeat(32);

function observation(overrides: Partial<Parameters<typeof parseStubObservation>[0]> = {}) {
  return parseStubObservation({
    txid: TXID,
    vout: 0,
    amountZatoshis: 50_000_000n,
    tex: TEX,
    blockHeight: 100,
    blockHash: "22".repeat(32),
    tipHeight: 109,
    ...overrides,
  });
}

test("one outpoint authorizes at most one mint after ten confirmations", () => {
  const spent = emptyMintLedger();
  const first = attestMint(observation(), spent);
  assert.equal(first.status, "eligible");
  const second = attestMint(observation(), spent);
  assert.equal(second.status, "rejected");
  assert.match(second.reason, /already authorized/);
});

test("zero-conf and shielded final transactions cannot mint", () => {
  const spent = emptyMintLedger();
  const early = attestMint(observation({ tipHeight: 100 }), spent);
  assert.equal(early.status, "provisional");
  const shielded = attestMint(observation({ shieldedBundle: true }), emptyMintLedger());
  assert.equal(shielded.status, "quarantined");
});
