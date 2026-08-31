import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { startMatcher } from "./server.ts";

async function startOnRandomPort(): Promise<{ server: ReturnType<typeof startMatcher>; port: number; dir: string }> {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-matcher-snap-"));
  const server = startMatcher({ host: "127.0.0.1", port: 0, persistPath: join(dir, "state.json") });
  await once(server, "listening");
  const port = (server.address() as AddressInfo).port;
  return { server, port, dir };
}

test("matcher /snapshot returns the combined ticker, depth, and trades", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/snapshot?depth=5&trades=10`);
    const body = await res.json() as {
      ticker: { bestBidTicks: string | null; bestAskTicks: string | null };
      depth: { bids: unknown[]; asks: unknown[] };
      trades: { count: number };
    };
    assert.equal(res.status, 200);
    assert.equal(body.ticker.bestBidTicks, null);
    assert.equal(body.ticker.bestAskTicks, null);
    assert.equal(body.depth.bids.length, 0);
    assert.equal(body.depth.asks.length, 0);
    assert.equal(body.trades.count, 0);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("matcher /snapshot rejects a negative depth", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/snapshot?depth=-1`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("matcher /snapshot rejects a negative trade limit", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/snapshot?trades=-1`);
    assert.equal(res.status, 400);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});
