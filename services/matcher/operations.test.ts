import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { startMatcher } from "./server.ts";

async function startOnRandomPort(): Promise<{ server: ReturnType<typeof startMatcher>; port: number; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-matcher-ops-"));
  const server = startMatcher({ host: "127.0.0.1", port: 0, persistPath: join(dir, "state.json") });
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  return { server, port, dir };
}

test("matcher /metrics returns a Prometheus text body with the requests counter", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/metrics`);
    const text = await res.text();
    assert.equal(res.status, 200);
    assert.match(text, /# HELP requests_total Total HTTP requests/);
    assert.match(text, /# TYPE requests_total counter/);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("matcher /slo returns the availability verdict", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/slo`);
    const body = await res.json() as { ok: boolean; verdict: { service: string; metric: string; meets: boolean } };
    assert.equal(res.status, 200);
    assert.equal(body.ok, true);
    assert.equal(body.verdict.service, "matcher");
    assert.equal(body.verdict.metric, "availability");
    assert.equal(typeof body.verdict.meets, "boolean");
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});
