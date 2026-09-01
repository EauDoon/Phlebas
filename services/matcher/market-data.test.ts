import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { startMatcher } from "./server.ts";

async function startOnRandomPort(): Promise<{ server: ReturnType<typeof startMatcher>; port: number; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-matcher-mkt-"));
  const server = startMatcher({ host: "127.0.0.1", port: 0, persistPath: join(dir, "state.json") });
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  return { server, port, dir };
}

test("matcher /ticker fails closed when persistence is unavailable", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ticker`);
    assert.equal(res.status, 503);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("matcher /trades fails closed when persistence is unavailable", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/trades`);
    assert.equal(res.status, 503);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("matcher /trades rejects a negative limit", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/trades?limit=-1`);
    assert.equal(res.status, 503);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("matcher /depth fails closed when persistence is unavailable", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/depth?levels=5`);
    assert.equal(res.status, 503);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("matcher /depth rejects a negative level count", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/depth?levels=-1`);
    assert.equal(res.status, 503);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("matcher /markets fails closed when persistence is unavailable", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/markets`);
    assert.equal(res.status, 503);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});
