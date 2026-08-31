import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { startMatcher } from "./server.ts";

async function startOnRandomPort(): Promise<{ server: ReturnType<typeof startMatcher>; port: number; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-matcher-ver-"));
  const server = startMatcher({ host: "127.0.0.1", port: 0, persistPath: join(dir, "state.json") });
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  return { server, port, dir };
}

test("matcher /version returns the canonical service and version", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/version`);
    const body = await res.json() as { ok: boolean; service: string; version: string };
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.service, "matcher");
    assert.equal(typeof body.version, "string");
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});
