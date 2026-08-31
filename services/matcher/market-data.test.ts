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

test("matcher /ticker returns the canonical ticker shape with null fields on an empty book", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/ticker`);
    const body = await res.json() as {
      bestBidTicks: string | null;
      bestAskTicks: string | null;
      midTicks: string | null;
      spreadTicks: string | null;
      lastPriceTicks: string | null;
      highTicks24h: string | null;
      lowTicks24h: string | null;
      volumeBase24h: string;
      volumeQuote24h: string;
      tradeCount24h: number;
      sequence: number;
      generatedAt: string;
    };
    assert.equal(res.status, 200);
    assert.equal(body.bestBidTicks, null);
    assert.equal(body.bestAskTicks, null);
    assert.equal(body.midTicks, null);
    assert.equal(body.spreadTicks, null);
    assert.equal(body.lastPriceTicks, null);
    assert.equal(body.highTicks24h, null);
    assert.equal(body.lowTicks24h, null);
    assert.equal(body.volumeBase24h, "0");
    assert.equal(body.volumeQuote24h, "0");
    assert.equal(body.tradeCount24h, 0);
    assert.equal(body.sequence, 0);
    assert.equal(typeof body.generatedAt, "string");
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("matcher /trades returns an empty snapshot on a fresh operator", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/trades`);
    const body = await res.json() as { trades: unknown[]; count: number; generatedAt: string };
    assert.equal(res.status, 200);
    assert.equal(body.trades.length, 0);
    assert.equal(body.count, 0);
    assert.equal(typeof body.generatedAt, "string");
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
    assert.equal(res.status, 400);
    const body = await res.json() as { reason: string };
    assert.match(body.reason, /limit-must-be/);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("matcher /depth returns the requested number of levels", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/depth?levels=5`);
    const body = await res.json() as { bids: unknown[]; asks: unknown[]; sequence: number; generatedAt: string };
    assert.equal(res.status, 200);
    assert.equal(body.bids.length, 0);
    assert.equal(body.asks.length, 0);
    assert.equal(body.sequence, 0);
    assert.equal(typeof body.generatedAt, "string");
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
    assert.equal(res.status, 400);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});

test("matcher /markets returns the configured base and quote assets", async () => {
  const { server, port, dir } = await startOnRandomPort();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/markets`);
    const body = await res.json() as { baseAsset: string | null; quoteAssets: string[]; lastTicks: string; sequence: number };
    assert.equal(res.status, 200);
    // The default testnet operator configures pZEC as the base asset.
    assert.equal(body.baseAsset, "0x0000000000000000000000000000000000000001");
    assert.ok(Array.isArray(body.quoteAssets));
    assert.ok(body.quoteAssets.length >= 2);
    assert.equal(typeof body.lastTicks, "string");
    assert.equal(body.sequence, 0);
  } finally {
    server.close();
    await once(server, "close");
    await rm(dir, { recursive: true, force: true });
  }
});
