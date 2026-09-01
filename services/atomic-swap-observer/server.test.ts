import { strict as assert } from "node:assert";
import { test } from "node:test";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";

import { bootstrapService, buildController, startService } from "./server.ts";
import { emptyCoordinator } from "../../src/lib/atomic-coordinator.ts";
import type { EVMEventSource } from "../../src/lib/evm-observer.ts";
import type { ZcashEventSource } from "../../src/lib/zcash-observer.ts";
import type { AtomicSwapObserverServiceConfig } from "./types.ts";

const FILL_A = "0x" + "aa".repeat(32);
const CONTRACT = "0x" + "11".repeat(20);

const evmSource: EVMEventSource = { fetchLogs: async () => [] };
const zcashSource: ZcashEventSource = { fetchAddressOutpoints: async () => [], fetchSpend: async () => ({ spent: false, spendTxid: null }) };

function mkConfig(snapshotPath: string): AtomicSwapObserverServiceConfig {
  return {
    evm: { contractAddress: CONTRACT, fromBlock: 0n, source: evmSource },
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

test("bootstrapService returns ready when the snapshot exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-svc-"));
  try {
    const path = join(dir, "snap.json");
    const { writeSnapshot } = await import("../../src/lib/coordinator-persistence.ts");
    await writeSnapshot({ path }, emptyCoordinator());
    const cfg = mkConfig(path);
    const initial = await bootstrapService(cfg);
    assert.equal(initial.bootstrap, "ready");
    assert.equal(initial.state.cursor, 0n);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("bootstrapService returns ready on a fresh start with no marker", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-svc-"));
  try {
    const path = join(dir, "missing.json");
    const cfg = mkConfig(path);
    const initial = await bootstrapService(cfg);
    assert.equal(initial.bootstrap, "ready");
    assert.equal(initial.state.cursor, 0n);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("bootstrapService returns missing when the marker is set but the snapshot is gone", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-svc-"));
  try {
    const path = join(dir, "missing.json");
    const { writeFile } = await import("node:fs/promises");
    await writeFile(`${path}.initialized`, "initialized\n", "utf8");
    const cfg = mkConfig(path);
    const initial = await bootstrapService(cfg);
    assert.equal(initial.bootstrap, "missing");
    assert.match(initial.bootstrapError ?? "", /Snapshot file is missing/);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("buildController poll advances the cursor and persists the snapshot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-svc-"));
  try {
    const path = join(dir, "snap.json");
    const { EVMTOPICS } = await import("../../src/lib/evm-observer.ts");
    const evm: EVMEventSource = { fetchLogs: async () => [{ address: CONTRACT, blockNumber: 100n, txHash: "0x" + "11".repeat(32), logIndex: 0, topics: [EVMTOPICS.funded, FILL_A, "0x" + "00".repeat(32), "0x" + "00".repeat(32)], data: "0x" }] };
    const cfg = mkConfig(path);
    const evmOriginal = cfg.evm.source;
    // The poller reads cfg.evm.source; replace with the new source.
    const cfgWithEvm = { ...cfg, evm: { ...cfg.evm, source: evm } };
    const initial = { state: emptyCoordinator(), bootstrap: "ready" as const, bootstrapError: null };
    const controller = buildController(cfgWithEvm, initial);
    const out = await controller.poll(100n);
    assert.equal(out.state.cursor, 1n);
    assert.equal(out.state.fills[FILL_A].evmLeg.state, "funded");
    // Re-bootstrap from disk to confirm persistence
    const reloaded = await bootstrapService(cfgWithEvm);
    assert.equal(reloaded.state.cursor, 1n);
    assert.equal(reloaded.bootstrap, "ready");
    // Reference the original to keep the import alive
    void evmOriginal;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("startService exposes /health, /state, /fills, /alerts, and /fills/:fillId", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-svc-"));
  try {
    const path = join(dir, "snap.json");
    const { EVMTOPICS } = await import("../../src/lib/evm-observer.ts");
    const evm: EVMEventSource = { fetchLogs: async () => [{ address: CONTRACT, blockNumber: 100n, txHash: "0x" + "11".repeat(32), logIndex: 0, topics: [EVMTOPICS.funded, FILL_A, "0x" + "00".repeat(32), "0x" + "00".repeat(32)], data: "0x" }] };
    const cfg = mkConfig(path);
    const cfgWithEvm = { ...cfg, evm: { ...cfg.evm, source: evm } };
    const initial = { state: emptyCoordinator(), bootstrap: "ready" as const, bootstrapError: null };
    const server = startService({ config: cfgWithEvm, initial, host: "127.0.0.1", port: 0 });
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    try {
      const health = await (await fetch(`http://127.0.0.1:${port}/health`)).json() as { ok: boolean; bootstrap: string; authority: string };
      assert.equal(health.ok, true);
      assert.equal(health.bootstrap, "ready");
      assert.equal(health.authority, "diagnostic-untrusted");
      const missing = await fetch(`http://127.0.0.1:${port}/nope`);
      assert.equal(missing.status, 404);

      // Trigger a poll, then look up the fill.
      const observe = await (await fetch(`http://127.0.0.1:${port}/observe`, { method: "POST" })).json() as { ok: boolean; cursor: string };
      assert.equal(observe.ok, true);
      assert.equal(observe.cursor, "1");

      const fills = await (await fetch(`http://127.0.0.1:${port}/fills`)).json() as { count: number; fills: { fillId: string }[]; authority: string };
      assert.equal(fills.count, 1);
      assert.equal(fills.fills[0].fillId, FILL_A);
      assert.equal(fills.authority, "diagnostic-untrusted");

      const oneFill = await (await fetch(`http://127.0.0.1:${port}/fills/${FILL_A}`)).json() as { ok: boolean; state: string };
      assert.equal(oneFill.ok, true);
      assert.equal(oneFill.state, "awaiting-zec-fund");

      const wrongFill = await fetch(`http://127.0.0.1:${port}/fills/0x` + "ff".repeat(32));
      assert.equal(wrongFill.status, 404);

      const alerts = await (await fetch(`http://127.0.0.1:${port}/alerts`)).json() as { count: number; alerts: unknown[] };
      // The fill was just funded at now=100, far before the EVM
      // refund deadline of 900_100. The watchtower may emit zero
      // alerts until time advances. The endpoint must still return
      // a well-formed response.
      assert.equal(typeof alerts.count, "number");
      assert.ok(Array.isArray(alerts.alerts));

      const state = await (await fetch(`http://127.0.0.1:${port}/state`)).json() as { ok: boolean; fillCount: number; cursor: string };
      assert.equal(state.ok, true);
      assert.equal(state.fillCount, 1);
      assert.equal(state.cursor, "1");
    } finally {
      server.close();
      await once(server, "close");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("startService reports 503 on /health when the snapshot is missing after init", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-svc-"));
  try {
    const path = join(dir, "snap.json");
    const cfg = mkConfig(path);
    // Simulate a previous run: write the marker but no snapshot.
    const { writeFile } = await import("node:fs/promises");
    await writeFile(`${path}.initialized`, "initialized\n", "utf8");
    const initial = await bootstrapService(cfg);
    assert.equal(initial.bootstrap, "missing");
    const server = startService({ config: cfg, initial, host: "127.0.0.1", port: 0 });
    await once(server, "listening");
    const port = (server.address() as AddressInfo).port;
    try {
      const health = await fetch(`http://127.0.0.1:${port}/health`);
      assert.equal(health.status, 503);
      const body = await health.json() as { ok: boolean; bootstrap: string };
      assert.equal(body.ok, false);
      assert.equal(body.bootstrap, "missing");
    } finally {
      server.close();
      await once(server, "close");
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
