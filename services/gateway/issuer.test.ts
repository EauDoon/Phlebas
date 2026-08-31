import assert from "node:assert/strict";
import test from "node:test";

import { hexToBytes } from "../../src/lib/keccak.ts";
import { decodeTex } from "../../src/lib/tex.ts";

import { createGateway, issueTestnetIntent } from "./issuer.ts";
import { deriveTestnetChildKey, p2pkhHashFromPrivateKey } from "./keys.ts";

const MASTER = hexToBytes("11".repeat(32));

test("gateway issues unique spendable-shape testnet TEX addresses", () => {
  const state = createGateway(MASTER);
  const first = issueTestnetIntent(state);
  const second = issueTestnetIntent(state);
  assert.match(first.tex, /^textest1[0-9a-z]+$/);
  assert.notEqual(first.tex, second.tex);
  assert.notEqual(first.p2pkhHashHex, second.p2pkhHashHex);
  assert.equal(decodeTex(first.tex).network, "testnet");
  assert.doesNotMatch(first.request, /tex1[^t]|\{TEX_ADDRESS\}/);
  const child = deriveTestnetChildKey(MASTER, 0);
  assert.equal(Buffer.from(p2pkhHashFromPrivateKey(child)).toString("hex"), first.p2pkhHashHex);
});
