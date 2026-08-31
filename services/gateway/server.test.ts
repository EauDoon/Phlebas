import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import type { AddressInfo } from "node:net";

import { isTestnetTex } from "../../src/lib/tex.ts";

import { startGateway } from "./server.ts";

test("gateway HTTP issues unique textest intents on loopback", async () => {
  const server = startGateway({ host: "127.0.0.1", port: 0 });
  await once(server, "listening");
  const address = server.address() as AddressInfo;
  assert.equal(address.address, "127.0.0.1");
  const { port } = address;
  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    const healthBody = await health.json() as { network: string };
    assert.equal(health.ok, true);
    assert.equal(healthBody.network, "testnet");

    const first = await fetch(`http://127.0.0.1:${port}/intents`, { method: "POST" });
    const firstBody = await first.json() as { tex: string; request: string };
    assert.equal(first.status, 201);
    assert.equal(isTestnetTex(firstBody.tex), true);
    assert.match(firstBody.request, new RegExp(`zcash:${firstBody.tex}`));
    assert.doesNotMatch(firstBody.tex, /^tex1/);

    const second = await fetch(`http://127.0.0.1:${port}/intents`, { method: "POST" });
    const secondBody = await second.json() as { tex: string };
    assert.notEqual(secondBody.tex, firstBody.tex);

    const missing = await fetch(`http://127.0.0.1:${port}/nope`);
    assert.equal(missing.status, 404);
  } finally {
    server.close();
    await once(server, "close");
  }
});

test("gateway HTTP refuses further intents after the local cap", async () => {
  const server = startGateway({ host: "127.0.0.1", port: 0, maxIntents: 1 });
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    const first = await fetch(`http://127.0.0.1:${port}/intents`, { method: "POST" });
    assert.equal(first.status, 201);
    const second = await fetch(`http://127.0.0.1:${port}/intents`, { method: "POST" });
    const body = await second.json() as { reason: string };
    assert.equal(second.status, 429);
    assert.equal(body.reason, "intent-cap");
  } finally {
    server.close();
    await once(server, "close");
  }
});
