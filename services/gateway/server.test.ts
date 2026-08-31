import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { isTestnetTex } from "../../src/lib/tex.ts";

import { startGateway } from "./server.ts";

test("gateway HTTP issues unique textest intents on loopback", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-gateway-"));
  const server = startGateway({ host: "127.0.0.1", port: 0, dataDir: dir });
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
    await rm(dir, { recursive: true, force: true });
  }
});

test("gateway HTTP refuses further intents after the local cap", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-gateway-cap-"));
  const server = startGateway({ host: "127.0.0.1", port: 0, maxIntents: 1, dataDir: dir });
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
    await rm(dir, { recursive: true, force: true });
  }
});

test("gateway issued count survives process restart and still respects the cap", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-gateway-persist-"));
  const firstServer = startGateway({ host: "127.0.0.1", port: 0, maxIntents: 1, dataDir: dir });
  await once(firstServer, "listening");
  const { port: firstPort } = firstServer.address() as AddressInfo;
  try {
    const issued = await fetch(`http://127.0.0.1:${firstPort}/intents`, { method: "POST" });
    assert.equal(issued.status, 201);
  } finally {
    firstServer.close();
    await once(firstServer, "close");
  }

  const secondServer = startGateway({ host: "127.0.0.1", port: 0, maxIntents: 1, dataDir: dir });
  await once(secondServer, "listening");
  const { port } = secondServer.address() as AddressInfo;
  try {
    const blocked = await fetch(`http://127.0.0.1:${port}/intents`, { method: "POST" });
    const body = await blocked.json() as { reason: string };
    assert.equal(blocked.status, 429);
    assert.equal(body.reason, "intent-cap");
  } finally {
    secondServer.close();
    await once(secondServer, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("corrupt issued file fails closed instead of opening an unbounded ledger", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-gateway-corrupt-"));
  await writeFile(join(dir, "master.key"), `${"11".repeat(32)}\n`);
  await writeFile(join(dir, "issued"), "not-a-count");
  const server = startGateway({ host: "127.0.0.1", port: 0, maxIntents: 64, dataDir: dir });
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    const blocked = await fetch(`http://127.0.0.1:${port}/intents`, { method: "POST" });
    const body = await blocked.json() as { reason: string };
    assert.equal(blocked.status, 429);
    assert.equal(body.reason, "intent-cap");
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("master key without issued count fails closed so addresses are not reissued", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-gateway-orphan-"));
  await writeFile(join(dir, "master.key"), `${"11".repeat(32)}\n`);
  const server = startGateway({ host: "127.0.0.1", port: 0, maxIntents: 64, dataDir: dir });
  await once(server, "listening");
  const { port } = server.address() as AddressInfo;
  try {
    const blocked = await fetch(`http://127.0.0.1:${port}/intents`, { method: "POST" });
    const body = await blocked.json() as { reason: string };
    assert.equal(blocked.status, 429);
    assert.equal(body.reason, "intent-cap");
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});
