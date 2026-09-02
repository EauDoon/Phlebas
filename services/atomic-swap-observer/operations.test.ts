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
    watchtower: { reorgWindowSeconds: 120n, deadlineBuffer: 60n },
    fillIdByOutpoint: {},
    snapshotPath,
    pollIntervalSeconds: 5n,
    reorgDepth: 10n,
    fromBlock: 0n,
    fromHeight: 0n,
    sources: { evm: evmSource, zcash: zcashSource },
  };
}

test("observer /metrics returns a Prometheus text body with the polls counter", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-observer-metrics-"));
  try {
    const path = join(dir, "snap.json");
    const cfg = mkConfig(path);
    const initial = await bootstrapService(cfg);
    const server = startService({ config: cfg, initial, host: "127.0.0.1", port: 0 });
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    try {
      // Trigger a poll so the counter increments.
      await fetch(`http://127.0.0.1:${port}/observe`, { method: "POST" });
      const res = await fetch(`http://127.0.0.1:${port}/metrics`);
      const text = await res.text();
      assert.equal(res.status, 200);
      assert.match(text, /# HELP polls_total Total poll cycles/);
      assert.match(text, /# TYPE polls_total counter/);
    } finally {
      server.close();
      await once(server, "close");
      await rm(dir, { recursive: true, force: true });
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("observer /slo returns the availability verdict", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-observer-slo-"));
  try {
    const path = join(dir, "snap.json");
    const cfg = mkConfig(path);
    const initial = await bootstrapService(cfg);
    const server = startService({ config: cfg, initial, host: "127.0.0.1", port: 0 });
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    try {
      // Trigger a poll so the SLO sample is recorded.
      await fetch(`http://127.0.0.1:${port}/observe`, { method: "POST" });
      const res = await fetch(`http://127.0.0.1:${port}/slo`);
      const body = await res.json() as { ok: boolean; verdict: { service: string; metric: string; meets: boolean } };
      assert.equal(res.status, 200);
      assert.equal(body.ok, true);
      assert.equal(body.verdict.service, "observer");
      assert.equal(body.verdict.metric, "availability");
    } finally {
      server.close();
      await once(server, "close");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("observer reports a failed request to the operator and stays opaque to the caller", async () => {
  // The handler used to discard the error, so every 500 the observer
  // returned was untraceable. A poll failure is the easiest one to force:
  // the /observe route awaits the chain sources.
  const dir = await mkdtemp(join(tmpdir(), "phlebas-observer-error-"));
  try {
    const path = join(dir, "snap.json");
    const failing: ZcashEventSource = {
      fetchAddressOutpoints: async () => { throw new Error("zcash rpc refused the connection"); },
      fetchSpend: async () => ({ spent: false, spendTxid: null }),
    };
    const cfg = { ...mkConfig(path), zcash: { ...mkConfig(path).zcash, source: failing } };
    const initial = await bootstrapService(cfg);
    const reported: string[] = [];
    const server = startService({
      config: cfg,
      initial,
      host: "127.0.0.1",
      port: 0,
      onRequestError: (error) => reported.push(error instanceof Error ? error.message : String(error)),
    });
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/observe`, { method: "POST" });
      assert.equal(res.status, 500);
      const body = await res.json() as { reason?: string };
      // The caller learns nothing beyond the generic reason.
      assert.equal(body.reason, "diagnostic-service-error");
      assert.equal(JSON.stringify(body).includes("rpc"), false);
      // The operator learns why.
      assert.equal(reported.length, 1);
      assert.match(reported[0] ?? "", /zcash rpc refused the connection/);
    } finally {
      server.close();
      await once(server, "close");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
