import assert from "node:assert/strict";
import test from "node:test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { startService, bootstrapService } from "./server.ts";
import type { EVMEventSource } from "../../src/lib/evm-observer.ts";
import type { ZcashEventSource } from "../../src/lib/zcash-observer.ts";
import type { AtomicSwapObserverServiceConfig } from "./types.ts";

const evmSource: EVMEventSource = { fetchLogs: async () => [] };
const zcashSource: ZcashEventSource = { fetchAddressOutpoints: async () => [], fetchSpend: async () => ({ spent: false, spendTxid: null }) };

function mkConfig(snapshotPath: string): AtomicSwapObserverServiceConfig {
  return {
    evm: { contractAddress: "0x" + "11".repeat(20), fromBlock: 0n, source: evmSource },
    zcash: { network: "testnet", addresses: ["t1" + "aa".repeat(19)], fromHeight: 0n, source: zcashSource },
    watchtower: { reorgDepth: 10n, deadlineBuffer: 60n },
    fillIdByOutpoint: {},
    snapshotPath,
    pollIntervalSeconds: 5n,
    reorgDepth: 10n,
    fromBlock: 0n,
    fromHeight: 0n,
    sources: { evm: evmSource, zcash: zcashSource },
  };
}

test("observer sets the X-RateLimit-Remaining header on every response", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-observer-rl-"));
  try {
    const path = join(dir, "snap.json");
    const cfg = mkConfig(path);
    const initial = await bootstrapService(cfg);
    const server = startService({ config: cfg, initial, host: "127.0.0.1", port: 0 });
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
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

test("observer returns 429 after the per-key bucket is drained", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-observer-rl-429-"));
  try {
    const path = join(dir, "snap.json");
    const cfg = mkConfig(path);
    const initial = await bootstrapService(cfg);
    const server = startService({ config: cfg, initial, host: "127.0.0.1", port: 0 });
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    try {
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
