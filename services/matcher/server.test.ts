import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { startMatcher } from "./server.ts";

test("matcher HTTP health is loopback-only and starts at sequence zero", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-matcher-http-"));
  const server = startMatcher({ host: "127.0.0.1", port: 0, persistPath: join(dir, "state.json") });
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  assert.equal(address.address, "127.0.0.1");
  try {
    const health = await fetch(`http://127.0.0.1:${address.port}/health`);
    const body = await health.json() as {
      matcher: string;
      sequence: number;
      sequenceRoot: string;
      startedAt: number;
      lastSequenceAt: number;
    };
    assert.equal(health.ok, true);
    assert.equal(body.matcher, "local-operator");
    assert.equal(body.sequence, 0);
    assert.equal(body.sequenceRoot.length, 64);
    assert.match(body.sequenceRoot, /^[0-9a-f]{64}$/);
    assert.equal(typeof body.startedAt, "number");
    assert.equal(body.lastSequenceAt, body.startedAt);
    const sequence = await fetch(`http://127.0.0.1:${address.port}/sequence`);
    const sequenceBody = await sequence.json() as {
      sequence: number;
      sequenceRoot: string;
      after: number;
      receipts: unknown[];
    };
    assert.equal(sequence.status, 200);
    assert.equal(sequenceBody.sequence, 0);
    assert.equal(sequenceBody.sequenceRoot, body.sequenceRoot);
    assert.equal(sequenceBody.after, 0);
    assert.deepEqual(sequenceBody.receipts, []);
    const cursor = await fetch(`http://127.0.0.1:${address.port}/sequence?after=1`);
    const cursorBody = await cursor.json() as { after: number; receipts: unknown[] };
    assert.equal(cursorBody.after, 1);
    assert.deepEqual(cursorBody.receipts, []);
    const missing = await fetch(`http://127.0.0.1:${address.port}/nope`);
    assert.equal(missing.status, 404);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("matcher HTTP rejects a signature that does not recover to the maker", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-matcher-sig-"));
  const server = startMatcher({ host: "127.0.0.1", port: 0, persistPath: join(dir, "state.json") });
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  const signature = "0x0fd73c37f4362021fdd1693bdca85f8592eb338a7d62338504ba2cbaee2bb90f26bdec5b2efeb086308bce8a9db936bb754bfafeda2305485b91a3b1c371ee8b1b";
  try {
    const response = await fetch(`http://127.0.0.1:${port}/orders`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        maker: "0x0000000000000000000000000000000000000001",
        side: 0,
        baseAsset: "0x0000000000000000000000000000000000000001",
        quoteAsset: "0x0000000000000000000000000000000000000002",
        baseAmount: "100000000",
        limitPriceTicks: "5291",
        nonce: "1",
        accountEpoch: "0",
        expiry: "0",
        salt: "1",
        recipient: "0x0000000000000000000000000000000000000001",
        maximumFeeBps: 30,
        allowedVenues: 1,
        tif: "GTC",
        signature,
      }),
    });
    const body = await response.json() as { reason: string };
    assert.equal(response.status, 400);
    assert.match(body.reason, /does not match maker|Invalid signature|Recovery/);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});
