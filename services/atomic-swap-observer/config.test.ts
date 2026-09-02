import { strict as assert } from "node:assert";
import { test } from "node:test";

import { loadServiceConfig, ServiceConfigException } from "./config.ts";
import type { EVMEventSource } from "../../src/lib/evm-observer.ts";
import type { ZcashEventSource } from "../../src/lib/zcash-observer.ts";
import { htlcP2shAddress } from "../../src/lib/zcash-htlc.ts";
import { hexToBytes } from "../../src/lib/keccak.ts";

const evmSource: EVMEventSource = { fetchLogs: async () => [] };
const zcashSource: ZcashEventSource = { fetchAddressOutpoints: async () => [], fetchSpend: async () => ({ spent: false, spendTxid: null }) };
const sources = { evm: evmSource, zcash: zcashSource };
const TXID = "ab".repeat(32);
const REDEEM_SCRIPT_HEX = "6382012088a82066687aadf862bd776c8fc18b8e9f8e20089714856ee233b3902a591d0d5f29258876a91400112233445566778899aabbccddeeff00112233670380841eb17576a914ffeeddccbbaa99887766554433221100fedcba986888ac";
const TESTNET_ADDRESS = htlcP2shAddress(hexToBytes(REDEEM_SCRIPT_HEX), "testnet");
const MAINNET_ADDRESS = htlcP2shAddress(hexToBytes(REDEEM_SCRIPT_HEX), "mainnet");

function baseEnv(): Record<string, string> {
  return {
    PHLEBAS_CONDITIONAL_LOCK_ADDRESS: "0x" + "11".repeat(20),
    PHLEBAS_OBSERVER_SNAPSHOT_PATH: "/tmp/snapshot.json",
    PHLEBAS_ZCASH_NETWORK: "testnet",
    PHLEBAS_ZCASH_WATCH_ADDRESSES: TESTNET_ADDRESS,
    PHLEBAS_OBSERVER_FROM_BLOCK: "100",
    PHLEBAS_OBSERVER_FROM_HEIGHT: "200",
    PHLEBAS_OBSERVER_REORG_DEPTH: "10",
  PHLEBAS_OBSERVER_REORG_WINDOW_SECONDS: "120",
    PHLEBAS_OBSERVER_DEADLINE_BUFFER: "60",
    PHLEBAS_OBSERVER_POLL_INTERVAL_SECONDS: "15",
  };
}

test("loadServiceConfig returns a complete config for a valid env", () => {
  const cfg = loadServiceConfig(baseEnv(), sources);
  assert.equal(cfg.snapshotPath, "/tmp/snapshot.json");
  assert.equal(cfg.zcash.network, "testnet");
  assert.deepEqual(cfg.zcash.addresses, [TESTNET_ADDRESS]);
  assert.equal(cfg.fromBlock, 100n);
  assert.equal(cfg.fromHeight, 200n);
  assert.equal(cfg.reorgDepth, 10n);
  assert.equal(cfg.pollIntervalSeconds, 15n);
});

test("loadServiceConfig accepts an exact mainnet transparent P2SH observer boundary", () => {
  const env = baseEnv();
  env.PHLEBAS_ZCASH_NETWORK = "mainnet";
  env.PHLEBAS_ZCASH_WATCH_ADDRESSES = MAINNET_ADDRESS;
  const cfg = loadServiceConfig(env, sources);
  assert.equal(cfg.zcash.network, "mainnet");
  assert.deepEqual(cfg.zcash.addresses, [MAINNET_ADDRESS]);
});

test("loadServiceConfig rejects an unsupported or cross-network Zcash observer boundary", () => {
  const unsupported = baseEnv();
  unsupported.PHLEBAS_ZCASH_NETWORK = "regtest";
  assert.throws(() => loadServiceConfig(unsupported, sources), /exactly testnet or mainnet/);

  const crossNetwork = baseEnv();
  crossNetwork.PHLEBAS_ZCASH_WATCH_ADDRESSES = MAINNET_ADDRESS;
  assert.throws(() => loadServiceConfig(crossNetwork, sources), /only testnet transparent P2SH addresses/);
});

test("loadServiceConfig rejects a missing required variable", () => {
  const env = baseEnv();
  delete env.PHLEBAS_CONDITIONAL_LOCK_ADDRESS;
  assert.throws(() => loadServiceConfig(env, sources), ServiceConfigException);
});

test("loadServiceConfig rejects a non-numeric from block", () => {
  const env = baseEnv();
  env.PHLEBAS_OBSERVER_FROM_BLOCK = "abc";
  assert.throws(() => loadServiceConfig(env, sources), ServiceConfigException);
});

test("loadServiceConfig rejects a negative poll interval", () => {
  const env = baseEnv();
  env.PHLEBAS_OBSERVER_POLL_INTERVAL_SECONDS = "-1";
  assert.throws(() => loadServiceConfig(env, sources), ServiceConfigException);
});

test("loadServiceConfig rejects an empty watch-addresses list", () => {
  const env = baseEnv();
  env.PHLEBAS_ZCASH_WATCH_ADDRESSES = "";
  assert.throws(() => loadServiceConfig(env, sources), ServiceConfigException);
});

test("loadServiceConfig parses the outpoint-fill map", () => {
  const env = baseEnv();
  const fillId = "0x" + "aa".repeat(32);
  env.PHLEBAS_OUTPOINT_FILL_MAP = `0xdead:0=${fillId},0xbeef:1=${fillId}`;
  const cfg = loadServiceConfig(env, sources);
  assert.equal(cfg.fillIdByOutpoint["0xdead:0"], fillId);
  assert.equal(cfg.fillIdByOutpoint["0xbeef:1"], fillId);
});

test("loadServiceConfig rejects a malformed outpoint pair", () => {
  const env = baseEnv();
  env.PHLEBAS_OUTPOINT_FILL_MAP = "not-a-pair";
  assert.throws(() => loadServiceConfig(env, sources), ServiceConfigException);
});

test("loadServiceConfig parses and validates expected redeem scripts by exact outpoint", () => {
  const env = baseEnv();
  env.PHLEBAS_ZCASH_REDEEM_SCRIPT_MAP = `${TXID}:7=${REDEEM_SCRIPT_HEX}`;
  const cfg = loadServiceConfig(env, sources);
  assert.equal(cfg.zcash.expectedRedeemScriptByOutpoint?.[`${TXID}:7`], REDEEM_SCRIPT_HEX);
});

test("loadServiceConfig rejects a noncanonical expected redeem script", () => {
  const env = baseEnv();
  env.PHLEBAS_ZCASH_REDEEM_SCRIPT_MAP = `${TXID}:7=51`;
  assert.throws(() => loadServiceConfig(env, sources), ServiceConfigException);
});

test("loadServiceConfig rejects an oversized expected redeem script before decoding it", () => {
  const env = baseEnv();
  env.PHLEBAS_ZCASH_REDEEM_SCRIPT_MAP = `${TXID}:7=${"00".repeat(521)}`;
  assert.throws(() => loadServiceConfig(env, sources), ServiceConfigException);
});

test("loadServiceConfig rejects a noncanonical expected outpoint", () => {
  const env = baseEnv();
  env.PHLEBAS_ZCASH_REDEEM_SCRIPT_MAP = `0x${TXID}:7=${REDEEM_SCRIPT_HEX}`;
  assert.throws(() => loadServiceConfig(env, sources), ServiceConfigException);
});

test("loadServiceConfig rejects duplicate expected outpoints", () => {
  const env = baseEnv();
  env.PHLEBAS_ZCASH_REDEEM_SCRIPT_MAP = `${TXID}:7=${REDEEM_SCRIPT_HEX},${TXID}:7=${REDEEM_SCRIPT_HEX}`;
  assert.throws(() => loadServiceConfig(env, sources), ServiceConfigException);
});
