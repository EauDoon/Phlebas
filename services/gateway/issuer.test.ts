import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, unlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { hexToBytes } from "../../src/lib/keccak.ts";
import { decodeTex } from "../../src/lib/tex.ts";

import { createGateway, issueTestnetIntent, snapshotGateway } from "./issuer.ts";
import { deriveTestnetChildKey, p2pkhHashFromPrivateKey } from "./keys.ts";
import { loadGateway, saveGateway } from "./server.ts";

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

test("gateway snapshot preserves single-use receivers across restart", () => {
  const firstRun = createGateway(MASTER);
  const first = issueTestnetIntent(firstRun);
  const secondRun = createGateway(MASTER, snapshotGateway(firstRun));
  const second = issueTestnetIntent(secondRun);
  assert.equal(secondRun.sequence, 2);
  assert.notEqual(first.tex, second.tex);
  assert.throws(() => createGateway(new Uint8Array(31)), /32 bytes/);
  assert.throws(() => createGateway(MASTER, {
    sequence: 1,
    intents: [{ ...snapshotGateway(firstRun).intents[0], p2pkhHashHex: "00".repeat(20) }],
  }), /master key/);
});

test("gateway state and master key survive a filesystem reload", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "phlebas-gateway-"));
  try {
    const firstRun = await loadGateway({ dataDirectory });
    const first = issueTestnetIntent(firstRun);
    await saveGateway(firstRun, { dataDirectory });
    const secondRun = await loadGateway({ dataDirectory });
    const second = issueTestnetIntent(secondRun);
    assert.equal(secondRun.sequence, 2);
    assert.notEqual(first.tex, second.tex);
    assert.deepEqual(secondRun.master, firstRun.master);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});

test("gateway refuses to reuse derivation indexes when durable state disappears", async () => {
  const dataDirectory = await mkdtemp(join(tmpdir(), "phlebas-gateway-"));
  try {
    await loadGateway({ dataDirectory });
    await unlink(join(dataDirectory, "state.json"));
    await assert.rejects(() => loadGateway({ dataDirectory }), /state is missing/);
  } finally {
    await rm(dataDirectory, { recursive: true, force: true });
  }
});
