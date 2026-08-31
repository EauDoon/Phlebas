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
    const body = await health.json() as { matcher: string; sequence: number };
    assert.equal(health.ok, true);
    assert.equal(body.matcher, "local-operator");
    assert.equal(body.sequence, 0);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});
