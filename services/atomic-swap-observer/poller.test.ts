import { strict as assert } from "node:assert";
import { test } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { applyTransition, emptyCoordinator } from "../../src/lib/atomic-coordinator.ts";
import { loadInitialState, pollOnceInto } from "./poller.ts";
import type { AtomicSwapObserverServiceConfig } from "./types.ts";
import type { EVMEventSource, EVMEvent } from "../../src/lib/evm-observer.ts";
import type { ZcashEventSource, ZcashOutpointEvent } from "../../src/lib/zcash-observer.ts";
import type { Hex32 } from "../../src/lib/order-domain.ts";

const FILL_A = ("0x" + "aa".repeat(32)) as Hex32;
const CONTRACT = "0x" + "11".repeat(20);

function mkCfg(
  path: string,
  evm: EVMEventSource,
  zcash: ZcashEventSource,
  fillIdByOutpoint: Record<string, `0x${string}`> = {},
): AtomicSwapObserverServiceConfig {
  return {
    evm: { contractAddress: CONTRACT, fromBlock: 0n, source: evm },
    zcash: { addresses: ["t1" + "aa".repeat(19)], fromHeight: 0n, source: zcash },
    watchtower: { reorgDepth: 10n, deadlineBuffer: 60n },
    fillIdByOutpoint: fillIdByOutpoint as Readonly<Record<string, `0x${string}`>>,
    snapshotPath: path,
    pollIntervalSeconds: 5n,
    reorgDepth: 10n,
    fromBlock: 0n,
    fromHeight: 0n,
    sources: { evm, zcash },
  };
}

test("loadInitialState returns null when no snapshot exists", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-poller-"));
  try {
    const state = await loadInitialState(join(dir, "missing.json"));
    assert.equal(state, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("loadInitialState restores a previously written snapshot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-poller-"));
  try {
    const path = join(dir, "snap.json");
    const state = applyTransition(emptyCoordinator(), FILL_A, "evm-leg-funded", 100n);
    const { writeSnapshot } = await import("../../src/lib/coordinator-persistence.ts");
    await writeSnapshot({ path }, state);
    const restored = await loadInitialState(path);
    assert.ok(restored);
    assert.equal(restored.cursor, 1n);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("pollOnceInto applies EVM transitions and persists the snapshot", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-poller-"));
  try {
    const path = join(dir, "snap.json");
    const { EVMTOPICS } = await import("../../src/lib/evm-observer.ts");
    const evmEvent: EVMEvent = {
      kind: "funded",
      fillId: FILL_A,
      blockNumber: 100n,
      txHash: "0x" + "11".repeat(32),
      logIndex: 0,
      data: { raw: "0x" },
    };
    const evm: EVMEventSource = { fetchLogs: async () => [{ address: CONTRACT, blockNumber: 100n, txHash: evmEvent.txHash, logIndex: 0, topics: [EVMTOPICS.funded, FILL_A, "0x" + "00".repeat(32), "0x" + "00".repeat(32)], data: "0x" }] };
    const zcash: ZcashEventSource = { fetchAddressOutpoints: async () => [], fetchSpend: async () => ({ spent: false, spendTxid: null }) };
    const cfg = mkCfg(path, evm, zcash);
    const out = await pollOnceInto(emptyCoordinator(), cfg, 100n);
    assert.equal(out.state.cursor, 1n);
    assert.equal(out.state.fills[FILL_A].evmLeg.state, "funded");
    const { readSnapshot } = await import("../../src/lib/coordinator-persistence.ts");
    const restored = await readSnapshot({ path });
    assert.ok(restored);
    assert.equal(restored.fills[FILL_A].evmLeg.state, "funded");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("pollOnceInto applies ZEC transitions when the outpoint-fill map has an entry", async () => {
  const dir = await mkdtemp(join(tmpdir(), "phlebas-poller-"));
  try {
    const path = join(dir, "snap.json");
    const evm: EVMEventSource = { fetchLogs: async () => [] };
    const zecOutpoint: ZcashOutpointEvent = {
      kind: "funded",
      txid: "0xabc",
      vout: 0,
      address: "t1" + "aa".repeat(19),
      amountZatoshis: 1_000_000n,
      blockHeight: 100n,
    };
    const zcash: ZcashEventSource = {
      fetchAddressOutpoints: async () => [{ txid: zecOutpoint.txid, vout: 0, amountZatoshis: zecOutpoint.amountZatoshis, blockHeight: zecOutpoint.blockHeight }],
      fetchSpend: async () => ({ spent: false, spendTxid: null }),
    };
    const lookup: Record<string, `0x${string}`> = {};
    lookup[`${zecOutpoint.txid.toLowerCase()}:0`] = FILL_A;
    const cfg = mkCfg(path, evm, zcash, lookup);
    const out = await pollOnceInto(emptyCoordinator(), cfg, 100n);
    assert.equal(out.state.fills[FILL_A].zecLeg.state, "funded");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
