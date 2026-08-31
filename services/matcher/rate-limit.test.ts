import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { startMatcher } from "./server.ts";

test("matcher sets the X-RateLimit-Remaining header on every response", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-matcher-rl-"));
  try {
    const server = startMatcher({ host: "127.0.0.1", port: 0, persistPath: join(dir, "state.json") });
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(res.status, 200);
      const remaining = res.headers.get("X-RateLimit-Remaining");
      assert.ok(remaining !== null, "X-RateLimit-Remaining header should be set");
    } finally {
      server.close();
      await once(server, "close");
      await rm(dir, { recursive: true, force: true });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("matcher returns 429 after the per-key bucket is drained", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-matcher-rl-429-"));
  try {
    const server = startMatcher({ host: "127.0.0.1", port: 0, persistPath: join(dir, "state.json") });
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    try {
      // Capacity is 60 by default; send 70 requests to drain.
      let lastStatus = 0;
      for (let i = 0; i < 70; i++) {
        const res = await fetch(`http://127.0.0.1:${port}/health`);
        lastStatus = res.status;
        if (lastStatus === 429) break;
      }
      assert.equal(lastStatus, 429, "expected 429 after draining the bucket");
    } finally {
      server.close();
      await once(server, "close");
      await rm(dir, { recursive: true, force: true });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
