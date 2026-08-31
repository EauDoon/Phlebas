// Config loader for the atomic-swap observer service. The loader
// reads environment variables and returns a validated
// AtomicSwapObserverServiceConfig. The loader is the single source
// of truth for the service config; the rest of the service consumes
// the validated object.

import { normalizeHex32, type Hex32 } from "../../src/lib/order-domain.ts";
import type { AtomicSwapObserverServiceConfig } from "./types.ts";

export type ServiceConfigError =
  | { kind: "missing"; name: string }
  | { kind: "invalid"; name: string; reason: string }
  | { kind: "negative"; name: string };

export class ServiceConfigException extends Error {
  readonly detail: ServiceConfigError;
  constructor(detail: ServiceConfigError) {
    super(`Service config error (${detail.kind}) on ${detail.name}: ${"reason" in detail ? detail.reason : "required"}`);
    this.detail = detail;
  }
}

type EnvSource = Readonly<Record<string, string | undefined>>;

function readEnv(env: EnvSource, name: string): string | undefined {
  const v = env[name];
  return v === undefined || v === "" ? undefined : v;
}

function requireEnv(env: EnvSource, name: string): string {
  const v = readEnv(env, name);
  if (v === undefined) throw new ServiceConfigException({ kind: "missing", name });
  return v;
}

function parseBigInt(name: string, raw: string, minimum: bigint): bigint {
  let value: bigint;
  try {
    value = BigInt(raw);
  } catch (err) {
    throw new ServiceConfigException({ kind: "invalid", name, reason: err instanceof Error ? err.message : "not-a-bigint" });
  }
  if (value < minimum) throw new ServiceConfigException({ kind: "negative", name });
  return value;
}

function parseOutpointMap(env: EnvSource, name: string): Record<string, Hex32> {
  const raw = readEnv(env, name);
  if (raw === undefined) return {};
  const out: Record<string, Hex32> = {};
  for (const pair of raw.split(",")) {
    const [outpoint, fillId] = pair.split("=");
    if (!outpoint || !fillId) {
      throw new ServiceConfigException({ kind: "invalid", name, reason: `bad pair: ${pair}` });
    }
    const [txid, voutRaw] = outpoint.split(":");
    if (!txid || voutRaw === undefined) {
      throw new ServiceConfigException({ kind: "invalid", name, reason: `bad outpoint: ${outpoint}` });
    }
    const vout = Number(voutRaw);
    if (!Number.isInteger(vout) || vout < 0) {
      throw new ServiceConfigException({ kind: "invalid", name, reason: `bad vout: ${voutRaw}` });
    }
    const key = `${txid.toLowerCase()}:${vout}`;
    out[key] = normalizeHex32(fillId, `fill id for ${key}`);
  }
  return out;
}

export function loadServiceConfig(
  env: EnvSource,
  sources: AtomicSwapObserverServiceConfig["sources"],
): AtomicSwapObserverServiceConfig {
  const contractAddress = requireEnv(env, "PHLEBAS_CONDITIONAL_LOCK_ADDRESS");
  const snapshotPath = requireEnv(env, "PHLEBAS_OBSERVER_SNAPSHOT_PATH");
  const addressesRaw = requireEnv(env, "PHLEBAS_ZCASH_WATCH_ADDRESSES");
  const fromBlock = parseBigInt("PHLEBAS_OBSERVER_FROM_BLOCK", requireEnv(env, "PHLEBAS_OBSERVER_FROM_BLOCK"), 0n);
  const fromHeight = parseBigInt("PHLEBAS_OBSERVER_FROM_HEIGHT", requireEnv(env, "PHLEBAS_OBSERVER_FROM_HEIGHT"), 0n);
  const reorgDepth = parseBigInt("PHLEBAS_OBSERVER_REORG_DEPTH", requireEnv(env, "PHLEBAS_OBSERVER_REORG_DEPTH"), 1n);
  const deadlineBuffer = parseBigInt("PHLEBAS_OBSERVER_DEADLINE_BUFFER", requireEnv(env, "PHLEBAS_OBSERVER_DEADLINE_BUFFER"), 0n);
  const pollIntervalSeconds = parseBigInt("PHLEBAS_OBSERVER_POLL_INTERVAL_SECONDS", requireEnv(env, "PHLEBAS_OBSERVER_POLL_INTERVAL_SECONDS"), 1n);
  const fillIdByOutpoint = parseOutpointMap(env, "PHLEBAS_OUTPOINT_FILL_MAP");
  const addresses = addressesRaw.split(",").map((s) => s.trim()).filter((s) => s.length > 0);
  if (addresses.length === 0) {
    throw new ServiceConfigException({ kind: "invalid", name: "PHLEBAS_ZCASH_WATCH_ADDRESSES", reason: "must contain at least one address" });
  }
  return {
    evm: { contractAddress, fromBlock, source: sources.evm },
    zcash: { addresses, fromHeight, source: sources.zcash },
    watchtower: { reorgDepth, deadlineBuffer },
    fillIdByOutpoint,
    snapshotPath,
    pollIntervalSeconds,
    reorgDepth,
    fromBlock,
    fromHeight,
    sources,
  };
}
